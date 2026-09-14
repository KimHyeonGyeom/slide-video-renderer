#!/usr/bin/env node
// deck-prepare 가 만든 묶음을 골라 입력 큐에 넣고 결과를 기다린다. 결과는 slide-N/out.mp4, result.json, frames.png(검증용 프레임 모음).
// 사용: node scripts/deck-render.mjs <deckDir> <선택> [--open]
//   선택: 3 | 1,4,7 | 2-6 | all
// 고른 슬라이드는 전부 한 번에 큐에 들어가고, 떠 있는 워커 수만큼 동시에 처리된다 (워커 1개면 순차).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { connect, submit } from './queue-client.mjs';

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
  console.error('usage: node scripts/deck-render.mjs <deckDir> <3 | 1,4,7 | 2-6 | all> [--open]');
  process.exit(1);
}

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

// ── 큐에 넣고 결과 대기 ──
const redis = connect();
const requests = new Map();
for (const n of targets) {
  const request = JSON.parse(await readFile(path.join(deckDir, `slide-${n}`, 'request.json'), 'utf8'));
  request.slideId ??= `slide-${n}`;
  requests.set(request.slideId, { n, request, started: 0 });
}
console.log(`queueing slides [${targets.join(',')}] → waiting for results`);
const t0 = Date.now();
const results = [];
await submit(
  redis,
  [...requests.values()].map((r) => r.request),
  { onResult: async (msg) => results.push(await onResult(msg)) },
);
await redis.quit();
results.sort((a, b) => a.slide - b.slide);

console.log(`\nslide  status  render   audio    objects  warnings   (wall ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(
      `${String(r.slide).padStart(5)}  ok      ${fmt(r.msg.renderMs)}  ${String(r.msg.durationSec + 's').padEnd(8)} ${String(r.objects).padStart(7)}  ${r.msg.warnings.length ? r.msg.warnings.join('; ') : '-'}`,
    );
  } else {
    failed++;
    console.log(`${String(r.slide).padStart(5)}  error   ${r.msg.error.code}: ${r.msg.error.message}`);
  }
}
if (flag('open', false)) await run('open', [deckDir]);
process.exit(failed ? 1 : 0);

async function onResult(msg) {
  const { n, request } = requests.get(msg.slideId);
  const dir = path.join(deckDir, `slide-${n}`);
  await writeFile(path.join(dir, 'result.json'), JSON.stringify(msg, null, 2));
  if (msg.status !== 'ok') return { slide: n, ok: false, msg };
  await contactSheet(request, path.join(dir, 'out.mp4'), path.join(dir, 'frames.png'));
  console.log(`  slide ${n}: done (render ${(msg.renderMs / 1000).toFixed(1)}s)`);
  return { slide: n, ok: true, msg, objects: request.objects.length };
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
