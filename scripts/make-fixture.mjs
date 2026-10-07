#!/usr/bin/env node
// 로컬 테스트 픽스처 생성: slide.png(합성), audio.mp3(TTS 또는 무음), objects.json, request.json
// 사용: node scripts/make-fixture.mjs [outDir]   (기본 fixtures/sample)
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import sharp from 'sharp';

const run = promisify(execFile);
const EMU_PER_PX = 6350; // 16:9 표준 슬라이드(12,192,000 EMU) / 1920px
const px = (emu) => Math.round(emu / EMU_PER_PX);
const DURATION_SEC = 14; // 무음일 때 영상 길이. 효과 8개가 순서대로 들어간다

const outDir = path.resolve(process.argv[2] ?? 'fixtures/sample');
await mkdir(outDir, { recursive: true });

// 도형 4개 (EMU). 렌더 결과에서 효과가 아래 색 박스에 정확히 겹쳐야 변환이 맞는 것.
const shapes = {
  title: { left: 838200, top: 365125, width: 10515600, height: 1325563, fill: '#3b82f6' },
  chart: { left: 1524000, top: 2286000, width: 4572000, height: 3048000, fill: '#10b981' },
  shape: { left: 7620000, top: 2743200, width: 3048000, height: 1524000, fill: '#f59e0b' },
  // 넓고 높은 상자(1656×186px = 줄 높이 62px 세 줄) → marker 가 줄마다 세 획을 긋는다. 밝은 바탕에 가짜 글줄
  text: { left: 838200, top: 5651500, width: 10515600, height: 1181100, fill: '#f8fafc', lines: true },
};

// 효과 8개. 한 도형에 여러 효과가 시간을 달리해 들어간다 (spotlight 는 다른 spotlight 와 겹치지 않게)
const plan = [
  { id: 'title-box', shape: 'title', start: 0.5, end: 2.5, effect: 'box', color: '#FF3B30' },
  { id: 'chart-spotlight', shape: 'chart', start: 2.7, end: 4.7, effect: 'spotlight' },
  { id: 'chart-zoom', shape: 'chart', start: 5.0, end: 7.5, effect: 'zoom-box' },
  { id: 'text-marker', shape: 'text', start: 5.5, end: 8.5, effect: 'marker' },
  { id: 'shape-circle', shape: 'shape', start: 8.0, end: 10.3, effect: 'circle' },
  { id: 'title-underline', shape: 'title', start: 9.0, end: 11.0, effect: 'underline' },
  { id: 'shape-shake', shape: 'shape', start: 10.6, end: 13.0, effect: 'shake' },
  { id: 'text-glow', shape: 'text', start: 11.3, end: 13.5, effect: 'glow' },
];
const objects = plan.map(({ id, shape, start, end, effect, color }) => {
  const { left, top, width, height } = shapes[shape];
  return { id, left, top, width, height, start, end, effect, ...(color ? { color } : {}) };
});

// slide.png — 회색 배경 + 도형 위치에 색 박스
const rects = Object.entries(shapes)
  .map(([name, s]) => {
    const [x, y, w, h] = [px(s.left), px(s.top), px(s.width), px(s.height)];
    // 가짜 글줄: 둘째·셋째 줄 자리 (첫 줄은 라벨) → marker 획이 줄마다 하나씩 겹쳐야 한다
    const lines = s.lines
      ? [1, 2]
          .map((k) => `<rect x="${x + 16}" y="${y + 21 + 62 * k}" width="${w * 0.55}" height="20" rx="4" fill="#64748b"/>`)
          .join('')
      : '';
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${s.fill}"/>${lines}` +
      `<text x="${x + 16}" y="${y + 44}" font-size="36" font-family="sans-serif" fill="${s.lines ? '#334155' : '#fff'}">${name} (${x},${y} ${w}x${h})</text>`
    );
  })
  .join('');
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">` +
  `<rect width="1920" height="1080" fill="#e5e7eb"/>${rects}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, 'slide.png'));

// audio.mp3 — macOS say(Yuna) → mp3. 없으면 DURATION_SEC 초 무음
const mp3 = path.join(outDir, 'audio.mp3');
const aiff = path.join(outDir, 'audio.aiff');
const text =
  '이 슬라이드는 강조 효과 테스트입니다. 제목에 테두리, 차트에 스포트라이트와 확대, 본문에 형광펜, 도형에 동그라미, 제목에 밑줄, 도형 흔들기, 본문 글로우 순서로 나옵니다.';
try {
  await run('say', ['-v', 'Yuna', '-o', aiff, text]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, mp3]);
  await rm(aiff, { force: true });
  console.log('audio.mp3: Korean TTS (Yuna)');
} catch (e) {
  console.warn(`TTS unavailable, writing ${DURATION_SEC}s silence:`, e.message.split('\n')[0]);
  await run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=44100:cl=mono',
    '-t',
    String(DURATION_SEC),
    mp3,
  ]);
}

await writeFile(path.join(outDir, 'objects.json'), JSON.stringify(objects, null, 2));
const request = {
  slideId: 'sample',
  slideImage: path.join(outDir, 'slide.png'),
  audio: mp3,
  outputPath: path.join(outDir, 'out.mp4'),
  objects,
};
await writeFile(path.join(outDir, 'request.json'), JSON.stringify(request, null, 2));
console.log('fixture written to', outDir);
