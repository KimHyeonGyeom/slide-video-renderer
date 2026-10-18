import { describe, expect, it } from 'vitest';
import { layoutUnderline, MARGIN, STAR_R } from './underline.layout.js';

const stage = { width: 1920, height: 1080 };
const title = { left: 132, top: 58, width: 1656, height: 209 };
const opts = { star: true, seed: 0, stroke: 6 };

/** path d 에서 좌표 쌍을 전부 뽑는다 */
function points(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe('layoutUnderline', () => {
  it('밑줄은 박스 아래변 바로 밑에 박스 너비만큼 그어진다', () => {
    const { line, star, pushed } = layoutUnderline(title, stage, { ...opts, star: false });
    const pts = points(line);
    expect(pts[0].x).toBe(title.left);
    expect(pts[pts.length - 1].x).toBe(title.left + title.width);
    const bottom = title.top + title.height;
    for (const p of pts) {
      expect(p.y).toBeGreaterThan(bottom); // 박스 안으로 들어오지 않는다
      expect(p.y).toBeLessThan(bottom + 12);
    }
    expect(star).toBeUndefined();
    expect(pushed).toEqual({ x: 0, y: 0 });
  });

  it('같은 시드면 같은 모양, 다른 시드면 다른 흔들림', () => {
    const a = layoutUnderline(title, stage, opts);
    const b = layoutUnderline(title, stage, opts);
    const c = layoutUnderline(title, stage, { ...opts, seed: 1 });
    expect(a).toEqual(b);
    expect(c.line).not.toBe(a.line);
  });

  it('별은 밑줄 오른쪽 끝 바깥에서 선 끝을 딛고 선 위로 올라오는 한붓그리기 별이다', () => {
    const { line, star } = layoutUnderline(title, stage, opts);
    const end = points(line).at(-1)!;
    const pts = points(star!);
    expect(pts).toHaveLength(7); // 꼭짓점 5개 + 시작점으로 복귀 + 지나침
    expect(pts[0].x).toBeCloseTo(end.x, -1); // 시작(아래왼쪽 꼭짓점)이 선 끝에 닿는다
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(end.y - STAR_R); // 몸통은 선 위
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(end.x + STAR_R); // 박스 오른쪽 바깥으로 나간다
    expect(pts[6].x).toBeLessThan(pts[5].x); // 마지막 획이 시작점을 지나쳐 계속 간다
  });

  it('svg 상자는 밑줄과 별을 선 굵기까지 포함하는 정수 사각형이다', () => {
    const { box, line, star } = layoutUnderline(title, stage, opts);
    const pts = [...points(line), ...points(star!)];
    for (const v of [box.left, box.top, box.width, box.height]) expect(Number.isInteger(v)).toBe(true);
    expect(box.left).toBeLessThanOrEqual(Math.min(...pts.map((p) => p.x)) - 3);
    expect(box.top).toBeLessThanOrEqual(Math.min(...pts.map((p) => p.y)) - 3);
    expect(box.left + box.width).toBeGreaterThanOrEqual(Math.max(...pts.map((p) => p.x)) + 3);
    expect(box.top + box.height).toBeGreaterThanOrEqual(Math.max(...pts.map((p) => p.y)) + 3);
  });

  it('별이 오른쪽 가장자리 여백을 넘으면 밑줄 끝과 별을 함께 안쪽으로 민다', () => {
    const edge = { left: 1300, top: 500, width: 600, height: 80 }; // 오른쪽 변 1900
    const { line, star, pushed, box } = layoutUnderline(edge, stage, opts);
    expect(pushed.x).toBeLessThan(0);
    expect(pushed.y).toBe(0);
    expect(points(line).at(-1)!.x).toBe(edge.left + edge.width + pushed.x); // 밑줄도 같이 짧아진다
    expect(Math.max(...points(star!).map((p) => p.x)) + 3).toBeLessThanOrEqual(stage.width - MARGIN);
    expect(box.left + box.width).toBeLessThanOrEqual(stage.width - MARGIN + 1);
  });

  it('밀어도 밑줄은 최소 길이를 남기고, 밑줄만 있으면 밀지 않는다', () => {
    const tiny = { left: 1880, top: 500, width: 30, height: 40 };
    const withStar = layoutUnderline(tiny, stage, opts);
    const end = points(withStar.line).at(-1)!;
    expect(end.x - tiny.left).toBeGreaterThanOrEqual(12);
    expect(withStar.pushed.x).toBe(-(tiny.width - 12));

    const lineOnly = layoutUnderline(tiny, stage, { ...opts, star: false });
    expect(lineOnly.pushed).toEqual({ x: 0, y: 0 });
    expect(points(lineOnly.line).at(-1)!.x).toBe(tiny.left + tiny.width);
  });

  it('별이 위아래 가장자리를 넘으면 별만 민다', () => {
    const top = { left: 100, top: 0, width: 400, height: 10 }; // 밑줄이 y≈15, 별 몸통이 위로 나간다
    const up = layoutUnderline(top, stage, opts);
    expect(up.pushed.y).toBeGreaterThan(0);
    expect(Math.min(...points(up.star!).map((p) => p.y)) - 3).toBeGreaterThanOrEqual(MARGIN);
    expect(points(up.line)[0].y).toBeGreaterThan(top.top + top.height); // 밑줄은 그대로

    const bottom = { left: 100, top: 1040, width: 400, height: 30 }; // 밑줄이 y≈1075
    const down = layoutUnderline(bottom, stage, opts);
    expect(down.pushed.y).toBeLessThan(0);
    expect(Math.max(...points(down.star!).map((p) => p.y)) + 3).toBeLessThanOrEqual(stage.height - MARGIN);
  });
});
