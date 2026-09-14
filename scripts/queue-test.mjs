#!/usr/bin/env node
// 큐 동작 검증. Redis(npm run redis)와 워커(npm run start:dev)를 먼저 띄운 뒤:  node scripts/queue-test.mjs [--drain]
//  - 잘못된 메시지 4종 (JSON 아님 / 스키마 위반 / 없는 입력 파일 / 줌 겹침·start>=end) → 각각 status=error 결과가 온다
//  - 정상 렌더 1건 → status=ok, fixtures/sample/out.mp4
//  - 3건 한 번에 → 워커 하나가 순서대로 처리해 3건 모두 ok
//  - --drain: 렌더 도중 POST /drain → 그 렌더는 끝까지 가서 ok, 이후 새 작업은 안 꺼낸다 (k8s preStop 경로). 끝나면 워커를 다시 띄워야 한다
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { connect, submit } from './queue-client.mjs';

const HEALTH = (process.env.HEALTH_URL || 'http://localhost:8080').replace(/\/$/, '');
const DIR = 'fixtures/sample';
if (!existsSync(`${DIR}/request.json`)) execFileSync(process.execPath, ['scripts/make-fixture.mjs', DIR], { stdio: 'inherit' });
const load = async (name, slideId) => ({ ...JSON.parse(await readFile(`${DIR}/${name}.json`, 'utf8')), slideId });
const run = Date.now().toString(36); // 이전 실행의 결과와 섞이지 않게 slideId 에 붙인다

const health = await fetch(`${HEALTH}/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
console.log('== health:', JSON.stringify(health));
if (health.status !== 'ok') process.exit(1); // terminus 는 정상일 때도 error:{} 를 넣는다 — 빈 객체는 truthy

const redis = connect();
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};
const summary = (m) => (m.status === 'ok' ? `ok renderMs=${m.renderMs} warnings=${m.warnings.length}` : `error ${m.error.code}: ${m.error.message.slice(0, 80)}`);

console.log('== bad messages (expect one error result each)');
const bad = [
  ['{not json', null, 'VALIDATION_FAILED'],
  [await load('request-schema', `${run}-schema`), `${run}-schema`, 'VALIDATION_FAILED'],
  [await load('request-missing', `${run}-missing`), `${run}-missing`, 'INPUT_NOT_READABLE'],
  [await load('request-bad', `${run}-bad`), `${run}-bad`, 'INVALID_HIGHLIGHT'],
];
const badResults = await submit(redis, bad.map(([r]) => r), { timeoutSec: 60 });
for (const [, key, code] of bad) {
  const m = badResults.get(key);
  check(`${key ?? '(not json)'} → ${code}`, m?.status === 'error' && m.error.code === code, summary(m));
}

console.log('== single render');
await rm(`${DIR}/out.mp4`, { force: true });
const single = await submit(redis, [await load('request', `${run}-single`)]);
const s = single.get(`${run}-single`);
check('single → ok + out.mp4', s.status === 'ok' && existsSync(`${DIR}/out.mp4`), summary(s));

console.log('== 3 at once (one worker → processed in order, all ok)');
const trio = await submit(redis, await Promise.all([1, 2, 3].map((n) => load('request', `${run}-r${n}`))), {
  onResult: (m) => console.log(`  ${m.slideId}: ${summary(m)}`),
});
check('3 results ok', [...trio.values()].every((m) => m.status === 'ok'));

if (process.argv.includes('--drain')) {
  console.log('== drain during a render (preStop path)');
  const p = submit(redis, [await load('request', `${run}-drain`)]);
  await sleep(3000);
  const drained = await fetch(`${HEALTH}/drain`, { method: 'POST' }).then((r) => r.json());
  check('POST /drain → draining=true, current set', drained.draining === true && drained.current?.slideId === `${run}-drain`, JSON.stringify(drained));
  const d = (await p).get(`${run}-drain`);
  check('in-flight render still completes', d.status === 'ok', summary(d));
  const after = await fetch(`${HEALTH}/health`).then((r) => r.json());
  check('health after: current=null', after.info?.consumer?.current === null, JSON.stringify(after.info?.consumer));
  console.log('   (worker no longer takes jobs — restart it before the next test)');
}

await redis.quit();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
