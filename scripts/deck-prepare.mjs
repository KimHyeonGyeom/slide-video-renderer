#!/usr/bin/env node
// 덱(pptx) 하나를 슬라이드별 테스트 묶음으로 만든다.
//   fixtures/deck/<name>/deck.objects.json            추출 원본(전체 객체)
//   fixtures/deck/<name>/slide-N/slide.png            슬라이드 이미지
//   fixtures/deck/<name>/slide-N/audio.mp3            음성 (없으면 TTS 로 생성, 있으면 그대로 둔다)
//   fixtures/deck/<name>/slide-N/request.json         요청 본문 (없으면 생성, 있으면 그대로 둔다 → 손으로 고친 것이 보존됨)
//
// 사용: node scripts/deck-prepare.mjs --pptx deck.pptx (--images dir | --pdf deck.pdf) [--out fixtures/deck/<name>]
//       [--durations 10,15,20,...] [--force] [--force-requests]
//   --images  slide-N.png 이 들어 있는 폴더 (PowerPoint/Keynote 에서 내보낸 것)
//   --pdf     PDF 를 주면 pdf-to-png.py 로 페이지별 PNG 를 만든다
//   --durations  슬라이드별 목표 음성 길이(초). 부족하면 뒤는 기본 스케줄(10초~300초)로 채운다
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// ── 인자 ──
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
    return acc;
  }, []),
);
if (!args.pptx || (!args.images && !args.pdf)) {
  console.error('usage: node scripts/deck-prepare.mjs --pptx deck.pptx (--images dir | --pdf deck.pdf) [--out dir] [--durations 10,20,...] [--force]');
  process.exit(1);
}
const pptx = path.resolve(args.pptx);
const deckName = path.basename(pptx, '.pptx').replace(/[^\w-]+/g, '_');
const outDir = path.resolve(args.out ?? path.join('fixtures/deck', deckName));
const force = args.force === true;
/** --force-requests: 음성·이미지는 두고 request.json 만 다시 만든다 (효과 규칙을 바꿨을 때) */
const forceRequests = force || args['force-requests'] === true;

/** 슬라이드별 목표 음성 길이(초). 10초 ~ 5분 사이를 섞어서 짧은 것과 긴 것을 번갈아 테스트한다 */
const DEFAULT_DURATIONS = [10, 15, 20, 30, 45, 60, 25, 90, 12, 120, 40, 180, 35, 240, 50, 300, 75, 20];
const durations = args.durations ? String(args.durations).split(',').map(Number) : [];

/** 나레이션을 목표 길이까지 채우는 발표용 문장 */
const FILLERS = [
  '이 부분은 발표의 핵심 내용을 담고 있습니다.',
  '잠시 화면을 함께 보시겠습니다.',
  '다음으로 넘어가기 전에 요점을 정리하겠습니다.',
  '여기서 강조하고 싶은 점은 구조와 흐름입니다.',
  '세부 내용은 배포해 드린 자료를 참고해 주시면 됩니다.',
  '이 항목은 뒤에서 다시 한 번 다루겠습니다.',
  '지금 보시는 내용이 오늘 발표의 배경이 됩니다.',
  '질문이 있으시면 발표가 끝난 뒤에 말씀해 주세요.',
  '이 흐름을 기억해 두시면 다음 슬라이드가 이해하기 쉽습니다.',
  '수치는 최근 자료를 기준으로 정리했습니다.',
];

await mkdir(outDir, { recursive: true });

// ── 1. 객체 추출 ──
const objectsJson = path.join(outDir, 'deck.objects.json');
if (force || !existsSync(objectsJson)) {
  await run(process.execPath, ['scripts/extract-pptx.mjs', pptx]);
  await copyFile(pptx.replace(/\.pptx$/i, '') + '.objects.json', objectsJson);
}
const { slideSize, slides } = JSON.parse(await readFile(objectsJson, 'utf8'));

// ── 2. 슬라이드 이미지 ──
let imagesDir = args.images ? path.resolve(args.images) : null;
if (!imagesDir) {
  imagesDir = path.join(outDir, '.pages');
  if (force || !existsSync(path.join(imagesDir, 'slide-1.png'))) {
    await run('python3', ['scripts/pdf-to-png.py', path.resolve(args.pdf), imagesDir, '1920'], { maxBuffer: 1e7 });
  }
}

// ── 3. 슬라이드마다 묶음 생성 ──
const summary = [];
for (const s of slides) {
  const dir = path.join(outDir, `slide-${s.index}`);
  await mkdir(dir, { recursive: true });
  const target = durations[s.index - 1] ?? DEFAULT_DURATIONS[(s.index - 1) % DEFAULT_DURATIONS.length];

  const image = path.join(dir, 'slide.png');
  const src = path.join(imagesDir, `slide-${s.index}.png`);
  if (!existsSync(src)) {
    summary.push({ slide: s.index, note: `이미지 없음: ${src}` });
    continue;
  }
  if (force || !existsSync(image)) await copyFile(src, image);

  const picked = pickObjects(s.objects, slideSize);
  if (picked.length === 0) {
    summary.push({ slide: s.index, note: '강조할 객체 없음' });
    continue;
  }

  const audio = path.join(dir, 'audio.mp3');
  if (force || !existsSync(audio)) await makeNarration(s.index, picked, target, audio);
  const durationSec = await probe(audio);

  const request = path.join(dir, 'request.json');
  if (forceRequests || !existsSync(request)) {
    const objects = planHighlights(picked, durationSec);
    const body = { slideId: `${deckName}-${s.index}`, slideImage: image, audio, outputPath: path.join(dir, 'out.mp4'), objects };
    await writeFile(request, JSON.stringify(body, null, 2));
  }
  const { objects } = JSON.parse(await readFile(request, 'utf8'));
  summary.push({
    slide: s.index,
    audio: `${durationSec.toFixed(1)}s`,
    objects: objects.length,
    effects: Object.entries(objects.reduce((m, o) => ((m[o.effect] = (m[o.effect] ?? 0) + 1), m), {}))
      .map(([k, v]) => `${k}×${v}`)
      .join(' '),
  });
}

console.log(`deck: ${deckName} → ${outDir}`);
console.log('slide  audio     objects  effects');
for (const r of summary) {
  console.log(`${String(r.slide).padStart(5)}  ${(r.audio ?? '-').padEnd(9)} ${String(r.objects ?? '-').padStart(7)}  ${r.effects ?? r.note}`);
}

// ── 객체 선택: 강조할 만한 것만 ──
function pickObjects(objects, size) {
  const W = size.cx, H = size.cy;
  const decorative = (o) => {
    const areaRatio = (o.width * o.height) / (W * H);
    const sideBar = o.width / W < 0.2 && o.height / H > 0.85;
    const stripe = o.height / H < 0.12 && o.width / W > 0.9;
    return areaRatio > 0.5 || sideBar || stripe;
  };
  const punctuationOnly = (t) => !t || /^[\s“”"'.,·ㅣ|\-–—]*$/.test(t);
  const rowBand = H * 0.08; // 비슷한 높이는 같은 줄로 보고 왼쪽부터
  return objects
    .filter((o) => o.left != null && o.kind !== 'group' && o.kind !== 'connector' && !o.rot && !decorative(o))
    .filter((o) => ['picture', 'chart', 'table'].includes(o.kind) || !punctuationOnly(o.text))
    .sort((a, b) => Math.round(a.top / rowBand) - Math.round(b.top / rowBand) || a.left - b.left)
    .slice(0, 8);
}

// ── 효과와 타이밍: 음성 길이 전체에 고르게 퍼뜨린다 ──
function planHighlights(picked, durationSec) {
  let textSeen = 0;
  const items = picked.map((o) => {
    let effect, length;
    if (o.kind === 'picture') {
      effect = 'zoom-box';
      length = 4;
    } else if (o.kind === 'chart' || o.kind === 'table') {
      effect = 'zoom-box';
      length = 5;
    } else {
      // 첫 텍스트(제목)는 box, 짧은 라벨(20자 이하)은 shake, 그 뒤 긴 텍스트는 세 번째마다 zoom, 나머지 box
      textSeen += 1;
      const len = o.text.length;
      effect = textSeen === 1 ? 'box' : len <= 20 ? 'shake' : textSeen % 3 === 0 ? 'zoom' : 'box';
      length = Math.min(8, Math.max(2, 1.5 + len * 0.08));
    }
    return { o, effect, length };
  });
  // 전체 강조 시간이 음성보다 길면 줄인다 (최소 1초)
  const total = items.reduce((a, i) => a + i.length, 0);
  const maxTotal = durationSec - items.length * 0.5;
  if (total > maxTotal) {
    const k = Math.max(0.2, maxTotal / total);
    for (const i of items) i.length = Math.max(1, i.length * k);
  }
  const used = items.reduce((a, i) => a + i.length, 0);
  const gap = Math.max(0.3, (durationSec - used) / (items.length + 1));
  let t = gap;
  return items.map(({ o, effect, length }) => {
    const start = Math.round(t * 100) / 100;
    const end = Math.round(Math.min(durationSec, t + length) * 100) / 100;
    t += length + gap;
    return { id: o.name.replace(/\s+/g, '_'), left: o.left, top: o.top, width: o.width, height: o.height, start, end, effect };
  });
}

// ── 나레이션: 객체 텍스트 → 발표 문장으로 채움 → 목표 길이에 정확히 맞춤 ──
async function makeNarration(index, picked, targetSec, outMp3) {
  const parts = [`${index}번째 슬라이드입니다.`];
  for (const o of picked) {
    if (o.kind === 'picture') parts.push('여기 이미지를 함께 보시겠습니다.');
    else if (o.kind === 'chart') parts.push('이 차트를 확대해서 보겠습니다.');
    else if (o.kind === 'table') parts.push('표의 내용을 확인해 보겠습니다.');
    else parts.push(`${o.text.slice(0, 80)} 부분입니다.`);
  }
  const base = parts.join(' ');
  const aiff = outMp3.replace(/\.mp3$/, '.aiff');
  const tts = async (text) => {
    await run('say', ['-v', 'Yuna', '-r', '175', '-o', aiff, text]);
    return probe(aiff);
  };
  // 기본 문장의 길이를 재고, 부족한 만큼 발표 문장을 붙인다 (문장 길이는 처음 측정한 비율로 추정)
  const baseSec = await tts(base);
  let text = base;
  if (baseSec < targetSec) {
    const secPerChar = baseSec / base.length;
    const fill = [];
    let sec = baseSec;
    for (let i = 0; sec < targetSec + 2; i++) {
      const f = FILLERS[i % FILLERS.length];
      fill.push(f);
      sec += f.length * secPerChar;
    }
    text = `${base} ${fill.join(' ')}`;
    await tts(text);
  }
  // 정확히 target 초로: 길면 자르고 짧으면 무음으로 채운다
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-af', `apad=whole_dur=${targetSec}`, '-t', String(targetSec), outMp3]);
  await rm(aiff, { force: true });
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(parseFloat(stdout) * 100) / 100;
}
