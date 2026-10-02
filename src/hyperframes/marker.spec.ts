import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// 브라우저용 IIFE(effects/common.js → effects/marker.js)를 가짜 window 에 로드해 순수 함수 HL.markerStrokes 만 검증한다.
// DOM·GSAP 는 효과 함수(HL.effects.marker) 안에서만 쓰이므로 로드 자체에는 필요 없다.
const EFFECTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'effects');

interface Box {
  domId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Stroke {
  d: string;
  length: number;
  width: number;
  yc: number;
}
let markerStrokes: (o: Box) => Stroke[];

beforeAll(async () => {
  const win: Record<string, unknown> = {};
  for (const name of ['common.js', 'marker.js']) {
    const src = await readFile(path.join(EFFECTS_DIR, name), 'utf8');
    new Function('window', src)(win);
  }
  markerStrokes = (win.HL as { markerStrokes: typeof markerStrokes }).markerStrokes;
});

/** path 의 시작 x (M x y ...) */
const startX = (s: Stroke) => Number(/^M(-?[\d.]+)/.exec(s.d)![1]);

describe('marker 획 나누기 (HL.markerStrokes)', () => {
  it('한 줄 제목(넓고 낮은 상자)은 한 획이고 굵기는 상자 높이에 가깝다', () => {
    const s = markerStrokes({ domId: 'hl-0', left: 114, top: 108, width: 650, height: 92 });
    expect(s).toHaveLength(1);
    expect(s[0].width).toBeCloseTo(92 * 0.92, 5);
    expect(s[0].yc).toBeGreaterThan(108);
    expect(s[0].yc).toBeLessThan(200);
    expect(startX(s[0])).toBeLessThan(114); // 글자 왼쪽 끝을 조금 지나서 시작
    // 길이 = 상자 너비 + 양끝 지나친 만큼 (+ 구불거림). dash 애니메이션이 이 값을 쓴다
    expect(s[0].length).toBeGreaterThan(650);
    expect(s[0].length).toBeLessThan(650 * 1.25);
  });

  it('여러 줄 텍스트(넓고 높은 상자)는 줄 높이 추정값으로 나눠 지그재그로 긋는다', () => {
    const s = markerStrokes({ domId: 'hl-1', left: 120, top: 312, width: 780, height: 186 });
    expect(s).toHaveLength(3);
    // 왼→오, 오→왼, 왼→오
    expect(startX(s[0])).toBeLessThan(120);
    expect(startX(s[1])).toBeGreaterThan(900);
    expect(startX(s[2])).toBeLessThan(120);
    // 획 중심은 각 줄 가운데 근처, 굵기는 줄 높이보다 조금 커서 이웃과 겹친다
    expect(s[0].yc).toBeCloseTo(343, -1);
    expect(s[1].yc).toBeCloseTo(405, -1);
    expect(s[2].yc).toBeCloseTo(467, -1);
    expect(s[0].width).toBeCloseTo(62 * 1.12, 5);
  });

  it('큰 숫자 하나처럼 좁고 높은 상자는 한 획으로 덮는다', () => {
    const s = markerStrokes({ domId: 'hl-2', left: 1336, top: 316, width: 300, height: 156 });
    expect(s).toHaveLength(1);
    expect(s[0].width).toBeCloseTo(156 * 0.92, 5);
  });

  it('같은 상자는 항상 같은 모양(워커가 달라도 같은 프레임), 다른 객체는 다른 모양', () => {
    const box: Box = { domId: 'hl-1', left: 120, top: 312, width: 780, height: 186 };
    expect(markerStrokes(box)).toEqual(markerStrokes({ ...box }));
    expect(markerStrokes(box)[0].d).not.toBe(markerStrokes({ ...box, domId: 'hl-5' })[0].d);
  });
});
