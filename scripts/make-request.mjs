#!/usr/bin/env node
// objects.json(extract-pptx 출력) + 슬라이드 PNG 로 렌더 요청 본문을 만든다. 음성은 슬라이드 텍스트를 macOS TTS 로 읽어 만든다.
// 사용: node scripts/make-request.mjs deck.objects.json slidesDir slideIndex outDir
// 출력: outDir/slide-N.mp3, outDir/slide-N.request.json  (outputPath 는 outDir/slide-N.mp4)
// 객체 선택 규칙: 그룹·연결선·회전된 객체·슬라이드의 절반 이상을 덮는 배경 도형은 제외, 텍스트가 있는 도형과 그림만.
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [jsonPath, slidesDir, slideArg, outDirArg] = process.argv.slice(2);
if (!jsonPath || !slidesDir || !slideArg) {
  console.error('usage: node scripts/make-request.mjs deck.objects.json slidesDir slideIndex [outDir]');
  process.exit(1);
}
const slideIndex = Number(slideArg);
const outDir = path.resolve(outDirArg ?? path.dirname(jsonPath));
await mkdir(outDir, { recursive: true });

const { slideSize, slides } = JSON.parse(await readFile(jsonPath, 'utf8'));
const slide = slides.find((s) => s.index === slideIndex);
if (!slide) throw new Error(`slide ${slideIndex} not in ${jsonPath}`);

// ── 객체 선택 ──
const slideArea = slideSize.cx * slideSize.cy;
const picked = slide.objects
  .filter((o) => o.left != null && o.kind !== 'group' && o.kind !== 'connector' && !o.rot)
  .filter((o) => (o.width * o.height) / slideArea < 0.5) // 배경 도형 제외
  .filter((o) => o.kind === 'picture' || o.kind === 'chart' || o.kind === 'table' || (o.text && o.text.trim().length > 0))
  .sort((a, b) => a.top - b.top || a.left - b.left); // 읽는 순서
if (picked.length === 0) throw new Error(`slide ${slideIndex}: no highlightable objects`);

// ── 음성: 텍스트를 읽는다 ──
const texts = picked.map((o) => o.text).filter(Boolean);
const script = texts.length ? texts.join('. ') : `슬라이드 ${slideIndex}`;
const voice = /[가-힣]/.test(script) ? 'Yuna' : 'Samantha';
const mp3 = path.join(outDir, `slide-${slideIndex}.mp3`);
const aiff = path.join(outDir, `slide-${slideIndex}.aiff`);
await run('say', ['-v', voice, '-r', '175', '-o', aiff, script]);
await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, mp3]);
await rm(aiff, { force: true });
const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]);
const durationSec = Math.round(parseFloat(stdout) * 100) / 100;

// ── 타이밍: 텍스트 길이에 비례해 음성 구간을 나눈다 ──
const weights = picked.map((o) => Math.max(8, (o.text || '').length));
const total = weights.reduce((a, b) => a + b, 0);
let cursor = 0;
const objects = picked.map((o, i) => {
  const seg = (durationSec * weights[i]) / total;
  const start = Math.round((cursor + Math.min(0.2, seg * 0.1)) * 100) / 100;
  const end = Math.round((cursor + seg - Math.min(0.15, seg * 0.1)) * 100) / 100;
  cursor += seg;
  const effect = o.kind === 'picture' ? 'zoom-box' : (o.text || '').length <= 20 ? 'shake' : 'box';
  return { id: `${o.name}`.replace(/\s+/g, '_'), left: o.left, top: o.top, width: o.width, height: o.height, start, end, effect };
});

const request = {
  slideId: `sample-${slideIndex}`,
  slideImage: path.resolve(slidesDir, `slide-${slideIndex}.png`),
  audio: mp3,
  outputPath: path.join(outDir, `slide-${slideIndex}.mp4`),
  objects,
};
const reqPath = path.join(outDir, `slide-${slideIndex}.request.json`);
await writeFile(reqPath, JSON.stringify(request, null, 2));
console.log(`slide ${slideIndex}: ${objects.length} objects, audio ${durationSec}s (${voice})`);
for (const o of objects) console.log(`  ${o.start.toFixed(2)}-${o.end.toFixed(2)}s  ${o.effect.padEnd(8)} ${o.id}`);
console.log(`written: ${reqPath}`);
