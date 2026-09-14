// 테스트 스크립트용 큐 클라이언트: 입력 큐에 넣고 출력 큐에서 결과를 기다린다. 앱과 같은 .env(REDIS_*)를 읽는다.
// 호출 측(Spring) 구현의 참고용이기도 하다: LPUSH 입력 → BRPOP 출력, slideId 로 짝을 맞춘다.
import 'dotenv/config';
import { Redis } from 'ioredis';

export const INPUT_KEY = process.env.REDIS_INPUT_KEY || 'render:input';
export const OUTPUT_KEY = process.env.REDIS_OUTPUT_KEY || 'render:output';

export function connect() {
  const sentinels = (process.env.REDIS_SENTINELS || 'localhost:26379')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [host, port] = s.split(':');
      return { host, port: Number(port) || 26379 };
    });
  return new Redis({
    sentinels,
    name: process.env.REDIS_MASTER_NAME || 'mymaster',
    role: 'master',
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
  });
}

/**
 * requests 를 입력 큐에 넣고 slideId 가 같은 결과가 전부 올 때까지 출력 큐를 BRPOP 한다.
 * 문자열 요청(JSON 아님 테스트)은 slideId 없는 결과와 짝을 맞춘다.
 * 출력 큐는 공유라 모르는 slideId 의 결과(이전 실행의 찌꺼기)는 꺼내서 버리고 경고만 남긴다.
 */
export async function submit(redis, requests, { timeoutSec = 3600, onResult } = {}) {
  const key = (r) => (typeof r === 'string' ? null : (r.slideId ?? null));
  const pending = new Set(requests.map(key));
  if (pending.size !== requests.length) throw new Error('every request needs a unique slideId');

  await redis.lpush(INPUT_KEY, ...requests.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))));
  const results = new Map();
  const deadline = Date.now() + timeoutSec * 1000;
  while (pending.size > 0 && Date.now() < deadline) {
    const popped = await redis.brpop(OUTPUT_KEY, 5);
    if (!popped) continue;
    const msg = JSON.parse(popped[1]);
    const k = msg.slideId ?? null;
    if (!pending.has(k)) {
      console.warn(`  (ignoring result for unknown slideId ${JSON.stringify(k)} — leftover from another run?)`);
      continue;
    }
    pending.delete(k);
    results.set(k, msg);
    onResult?.(msg);
  }
  if (pending.size > 0) throw new Error(`timed out waiting for results: ${[...pending].join(', ')}`);
  return results;
}
