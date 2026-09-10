#!/usr/bin/env node
// deck-prepare 가 만든 묶음을 골라 서버에 호출한다. 결과는 slide-N/out.mp4, result.json, frames.png(검증용 프레임 모음).
// 사용: node scripts/deck-render.mjs <deckDir> <선택> [--parallel N] [--server http://localhost:8080] [--open]
//   선택: 3 | 1,4,7 | 2-6 | all
//   --parallel N  N개씩 동시에 요청해 파드 안 대기열을 태운다 (기본 1 = 순차)
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

/**
 * 렌더는 수 분씩 걸리는데 Node 의 fetch(undici)는 응답 헤더를 5분만 기다리고 끊는다.
 * 그래서 타임아웃 없는 node:http 로 호출한다. 호출 측 HTTP 클라이언트도 같은 주의가 필요하다 (README).
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout: 0 }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body: JSON.parse(text) });
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

const run = promisify(execFile);
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const [deckDir, selection = 'all'] = positional;
if (!deckDir) {
  console.error('usage: node scripts/deck-render.mjs <deckDir> <3 | 1,4,7 | 2-6 | all> [--parallel N] [--server url] [--open]');
  process.exit(1);
}
const parallel = Number(flag('parallel', 1));
const server = String(flag('server', 'http://localhost:8080')).replace(/\/$/, '');

// ── 대상 슬라이드 ──
const available = (await readdir(deckDir))
  .map((d) => /^slide-(\d+)$/.exec(d)?.[1])
  .filter(Boolean)
  .map(Number)
  .filter((n) => existsSync(path.join(deckDir, `slide-${n}`, 'request.json')))
  .sort((a, b) => a - b);
const wanted =
  selection === 'all'
    ? available
    : selection.split(',').flatMap((part) => {
        const m = /^(\d+)-(\d+)$/.exec(part);
        return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i) : [Number(part)];
      });
const targets = wanted.filter((n) => available.includes(n));
if (targets.length === 0) {
  console.error(`no request.json for slides [${wanted.join(',')}] in ${deckDir} (available: ${available.join(',')})`);
  process.exit(1);
}

// ── 서버 확인 ──
try {
  const res = await fetch(`${server}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  console.error(`server not reachable at ${server}: ${err.message}. 먼저 npm run start:dev`);
  process.exit(1);
}

// ── 호출 (parallel 개씩) ──
console.log(`rendering slides [${targets.join(',')}] parallel=${parallel} → ${server}`);
const results = [];
let next = 0;
const worker = async () => {
  while (next < targets.length) {
    const n = targets[next++];
    results.push(await renderSlide(n));
  }
};
await Promise.all(Array.from({ length: Math.min(parallel, targets.length) }, worker));
results.sort((a, b) => a.slide - b.slide);

console.log('\nslide  status  queued   render   audio    objects  warnings');
let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(
      `${String(r.slide).padStart(5)}  200     ${fmt(r.body.queuedMs)}  ${fmt(r.body.renderMs)}  ${String(r.body.durationSec + 's').padEnd(8)} ${String(r.objects).padStart(7)}  ${r.body.warnings.length ? r.body.warnings.join('; ') : '-'}`,
    );
  } else {
    failed++;
    console.log(`${String(r.slide).padStart(5)}  ${String(r.status).padEnd(6)}  ${r.error}`);
  }
}
if (flag('open', false)) await run('open', [deckDir]);
process.exit(failed ? 1 : 0);

async function renderSlide(n) {
  const dir = path.join(deckDir, `slide-${n}`);
  const request = JSON.parse(await readFile(path.join(dir, 'request.json'), 'utf8'));
  const started = Date.now();
  console.log(`  slide ${n}: start (${request.objects.length} objects)`);
  let res, body;
  try {
    res = await postJson(`${server}/render`, request);
    body = res.body;
  } catch (err) {
    await writeFile(path.join(dir, 'result.json'), JSON.stringify({ error: err.message }, null, 2));
    return { slide: n, ok: false, status: 'ERR', error: err.message };
  }
  await writeFile(path.join(dir, 'result.json'), JSON.stringify(body, null, 2));
  if (!res.ok) {
    return { slide: n, ok: false, status: res.status, error: `${body.error}: ${Array.isArray(body.message) ? body.message.join('; ') : body.message}` };
  }
  await contactSheet(request, path.join(dir, 'out.mp4'), path.join(dir, 'frames.png'));
  console.log(`  slide ${n}: done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { slide: n, ok: true, body, objects: request.objects.length };
}

/** 객체마다 강조 중간 시점의 프레임을 뽑아 한 장으로 이어 붙인다 (한 줄에 4개) */
async function contactSheet(request, mp4, out) {
  const tmp = path.join(path.dirname(out), '.frames');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const W = 480, H = 270, LABEL = 22, COLS = 4;
  const tiles = [];
  for (const [i, o] of request.objects.entries()) {
    const t = ((o.start + o.end) / 2).toFixed(2);
    const png = path.join(tmp, `${i}.png`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t, '-i', mp4, '-frames:v', '1', '-vf', `scale=${W}:${H}`, png]);
    const label = `${o.effect} @${t}s ${o.id}`.slice(0, 60);
    const svg = `<svg width="${W}" height="${LABEL}"><rect width="${W}" height="${LABEL}" fill="#111"/><text x="6" y="16" font-size="13" font-family="sans-serif" fill="#fff">${escapeXml(label)}</text></svg>`;
    tiles.push({ input: png, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LABEL) + LABEL });
    tiles.push({ input: Buffer.from(svg), left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LABEL) });
  }
  const rows = Math.ceil(request.objects.length / COLS);
  await sharp({ create: { width: W * Math.min(COLS, request.objects.length), height: rows * (H + LABEL), channels: 3, background: '#222' } })
    .composite(tiles)
    .png()
    .toFile(out);
  await rm(tmp, { recursive: true, force: true });
}

function fmt(ms) {
  return `${(ms / 1000).toFixed(1)}s`.padEnd(7);
}
function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}
