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

const outDir = path.resolve(process.argv[2] ?? 'fixtures/sample');
await mkdir(outDir, { recursive: true });

// EMU 좌표. 렌더 결과에서 강조 테두리가 아래 색 박스에 정확히 겹쳐야 한다.
const objects = [
  {
    id: 'title',
    left: 838200,
    top: 365125,
    width: 10515600,
    height: 1325563,
    start: 0.5,
    end: 3.0,
    effect: 'box',
    color: '#FF3B30',
  },
  { id: 'chart', left: 1524000, top: 2286000, width: 4572000, height: 3048000, start: 3.5, end: 6.5, effect: 'zoom-box' },
  { id: 'shape', left: 7620000, top: 2743200, width: 3048000, height: 1524000, start: 6.8, end: 9.5, effect: 'shake' },
];
const fills = { title: '#3b82f6', chart: '#10b981', shape: '#f59e0b' };

// slide.png — 회색 배경 + 객체 위치에 색 박스
const rects = objects
  .map((o) => {
    const [x, y, w, h] = [px(o.left), px(o.top), px(o.width), px(o.height)];
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fills[o.id]}"/>` +
      `<text x="${x + 16}" y="${y + 44}" font-size="36" font-family="sans-serif" fill="#fff">${o.id} (${x},${y} ${w}x${h})</text>`
    );
  })
  .join('');
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">` +
  `<rect width="1920" height="1080" fill="#e5e7eb"/>${rects}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, 'slide.png'));

// audio.mp3 — macOS say(Yuna) → mp3. 없으면 10초 무음
const mp3 = path.join(outDir, 'audio.mp3');
const aiff = path.join(outDir, 'audio.aiff');
const text =
  '이 슬라이드는 강조 효과 테스트입니다. 먼저 제목에 테두리가 표시되고, 다음으로 차트 영역이 확대되며, 마지막으로 오른쪽 도형이 깜빡입니다.';
try {
  await run('say', ['-v', 'Yuna', '-o', aiff, text]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, mp3]);
  await rm(aiff, { force: true });
  console.log('audio.mp3: Korean TTS (Yuna)');
} catch (e) {
  console.warn('TTS unavailable, writing 10s silence:', e.message.split('\n')[0]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '10', mp3]);
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
