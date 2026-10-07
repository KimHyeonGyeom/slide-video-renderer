import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// effects/common.js → circle.js → underline.js 를 가짜 window 에 로드해 순수 함수 HL.circlePath / HL.underlinePath 를 검증한다.
// DOM·GSAP 는 효과 함수 안에서만 쓰이므로 로드 자체에는 필요 없다.
const EFFECTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'effects');

interface Box {
  domId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Curve {
  d: string;
  length: number;
}
let circlePath: (o: Box) => Curve;
let underlinePath: (o: Box) => Curve;

beforeAll(async () => {
  const win: Record<string, unknown> = {};
  for (const name of ['common.js', 'circle.js', 'underline.js']) {
    const src = await readFile(path.join(EFFECTS_DIR, name), 'utf8');
    new Function('window', src)(win);
  }
  const HL = win.HL as { circlePath: typeof circlePath; underlinePath: typeof underlinePath };
  circlePath = HL.circlePath;
  underlinePath = HL.underlinePath;
});

/** path 의 모든 좌표 (M/C 명령의 숫자 쌍. 제어점도 포함) */
function points(d: string): [number, number][] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

const kpi: Box = { domId: 'hl-0', left: 1336, top: 316, width: 300, height: 156 };

describe('circle (HL.circlePath)', () => {
  it('상자 둘레를 한 바퀴 조금 넘게 돈다: 길이가 타원 둘레의 1.1~1.3배', () => {
    const c = circlePath(kpi);
    const a = kpi.width / 2 + kpi.width * 0.1 + 16;
    const b = kpi.height / 2 + kpi.height * 0.25 + 12;
    const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); // Ramanujan 근사
    expect(c.length).toBeGreaterThan(perimeter * 1.1);
    expect(c.length).toBeLessThan(perimeter * 1.3);
  });

  it('모든 점이 상자를 두른 띠 안에 있고 시작점은 왼쪽 위', () => {
    const pts = points(circlePath(kpi).d);
    const cx = kpi.left + kpi.width / 2;
    const cy = kpi.top + kpi.height / 2;
    for (const [x, y] of pts) {
      expect(Math.abs(x - cx)).toBeLessThan(kpi.width / 2 + kpi.width * 0.12 + 16 + 20);
      expect(Math.abs(y - cy)).toBeLessThan(kpi.height / 2 + kpi.height * 0.3 + 12 + 20);
    }
    expect(pts[0][0]).toBeLessThan(cx);
    expect(pts[0][1]).toBeLessThan(cy);
  });

  it('같은 상자는 같은 모양(워커가 달라도 같은 프레임), 다른 객체는 다른 모양', () => {
    expect(circlePath(kpi)).toEqual(circlePath({ ...kpi }));
    expect(circlePath(kpi).d).not.toBe(circlePath({ ...kpi, domId: 'hl-9' }).d);
  });
});

describe('underline (HL.underlinePath)', () => {
  const title: Box = { domId: 'hl-1', left: 114, top: 108, width: 650, height: 92 };

  it('상자 아래쪽(높이의 90%)에 왼쪽에서 오른쪽으로, 양끝을 조금 지나쳐 긋는다', () => {
    const c = underlinePath(title);
    const pts = points(c.d);
    expect(pts[0][0]).toBeLessThan(title.left);
    expect(pts[pts.length - 1][0]).toBeGreaterThan(title.left + title.width);
    for (const [, y] of pts) expect(Math.abs(y - (title.top + title.height * 0.9))).toBeLessThan(8);
    expect(c.length).toBeGreaterThan(title.width);
    expect(c.length).toBeLessThan(title.width + 40);
  });

  it('같은 상자는 같은 모양', () => {
    expect(underlinePath(title)).toEqual(underlinePath({ ...title }));
  });
});
