#!/usr/bin/env node
// 추출한 객체 좌표(objects.json)를 슬라이드 이미지 위에 박스로 그려 좌표가 맞는지 눈으로 확인한다.
// 사용: node scripts/overlay-objects.mjs deck.objects.json imagesDir outDir
//   imagesDir/slide-N.png (pdf-to-png.py 출력) 위에 박스를 그려 outDir/slide-N.png 로 쓴다.
//   색: 도형 빨강, 그림 보라, 표/차트 주황, 연결선 청록, 그룹 파랑 점선, 플레이스홀더 초록
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [jsonPath, imagesDir, outDir] = process.argv.slice(2);
if (!jsonPath || !imagesDir || !outDir) {
  console.error('usage: node scripts/overlay-objects.mjs deck.objects.json imagesDir outDir');
  process.exit(1);
}
const { slideSize, slides } = JSON.parse(await readFile(jsonPath, 'utf8'));
await mkdir(outDir, { recursive: true });

const COLOR = { shape: '#e11d48', picture: '#7c3aed', table: '#ea580c', chart: '#ea580c', smartart: '#ea580c', frame: '#ea580c', connector: '#0891b2', group: '#2563eb' };

for (const s of slides) {
  const src = path.join(imagesDir, `slide-${s.index}.png`);
  if (!existsSync(src)) {
    console.log(`skip slide ${s.index}: ${src} not found`);
    continue;
  }
  const meta = await sharp(src).metadata();
  const scale = meta.width / slideSize.cx; // px per EMU (이미지 폭 기준)
  const px = (v) => v * scale;
  const boxes = s.objects
    .filter((o) => o.left != null)
    .map((o) => {
      const [x, y, w, h] = [px(o.left), px(o.top), Math.max(px(o.width), 1), Math.max(px(o.height), 1)];
      const color = o.placeholder ? '#16a34a' : COLOR[o.kind] ?? '#e11d48';
      const dash = o.kind === 'group' ? 'stroke-dasharray="10 6"' : '';
      const label = `${o.id}${o.kind === 'group' ? ' G' : ''}`;
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="3" ${dash}/>` +
        `<rect x="${x}" y="${Math.max(y - 22, 0)}" width="${label.length * 11 + 8}" height="22" fill="${color}"/>` +
        `<text x="${x + 4}" y="${Math.max(y - 6, 16)}" font-size="16" font-family="sans-serif" fill="#fff">${label}</text>`
      );
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${boxes}</svg>`;
  const out = path.join(outDir, `slide-${s.index}.png`);
  await sharp(src).composite([{ input: Buffer.from(svg) }]).png().toFile(out);
  console.log(`${out}  (${s.objects.length} objects)`);
}
