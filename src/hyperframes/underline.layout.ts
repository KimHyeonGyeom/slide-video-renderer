/**
 * underline / underline-star 의 모양을 정한다 (px, 스테이지 좌표). 순수 함수라 단위 테스트 대상이다.
 *
 * - 밑줄: 객체 박스 아래변 바로 밑에 박스 너비만큼. 손으로 그은 느낌을 위해 미세한 흔들림을 넣는다 (객체별 고정 시드 → 같은 요청이면 같은 그림)
 * - 별: 밑줄 오른쪽 끝 바깥, 선보다 살짝 위에 선 끝을 딛고 선 모양. 한붓그리기 펜타그램이고 아래왼쪽 꼭짓점에서 시작해 마지막 획이 시작점을 살짝 지나친다
 * - 별이 스테이지 가장자리 여백(MARGIN)을 넘으면 "밑줄 끝 + 별"을 한 덩어리로 안쪽으로 민다 (별만 뒤로 밀면 글자 위로 올라온다).
 *   밑줄 혼자는 박스에 붙어 있으므로 box 의 테두리처럼 그냥 잘려 나가게 둔다
 *
 * 결과는 svg 요소의 위치·크기(box)와 path 의 d 문자열이다. svg 의 viewBox 를 box 와 같게 두면 path 좌표는 스테이지 좌표 그대로다.
 * 그리는 시간(애니메이션)은 effects/underline.js 에 있다.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface UnderlineOptions {
  /** 별을 붙일지 (underline-star) */
  star: boolean;
  /** 흔들림 시드. 객체 순번을 주면 같은 요청에서 항상 같은 모양이 나온다 */
  seed: number;
  /** 선 굵기 (px). 요소 크기와 가장자리 계산에만 쓰이고 실제 굵기는 CSS 가 정한다 */
  stroke: number;
}

export interface UnderlineLayout {
  /** svg 요소의 위치·크기 (스테이지 px, 정수). viewBox 도 같은 값 */
  box: Rect;
  /** 밑줄 path 의 d */
  line: string;
  /** 별 path 의 d. star 옵션일 때만 */
  star?: string;
  /** 별을 가장자리 안쪽으로 민 거리 (px). 음수는 왼쪽/위. 둘 다 0 이면 밀지 않았다 */
  pushed: { x: number; y: number };
}

// ── 디자인 값 (설정이 아니다) ──
const GAP = 2; //          박스 아래변과 밑줄 윗면 사이 (px)
export const MARGIN = 16; // 스테이지 가장자리에서 별이 지킬 여백 (px). effects/zoom.js 의 MARGIN 과 같은 값
export const STAR_R = 32; // 별 바깥 반지름 (px). 객체 크기와 무관하게 고정
const WOBBLE = 1.5; //     밑줄 흔들림 진폭 (px)
const DRIFT = 2; //        밑줄이 끝에서 위아래로 치우치는 최대 거리 (px)
const SEGMENT = 90; //     흔들림 제어점 간격 (px)
const STAR_JITTER = 1.5; // 별 꼭짓점 흔들림 (px)
const OVERSHOOT = 0.12; // 별 마지막 획이 시작점을 지나치는 비율 (마지막 변 길이 기준)
const MIN_LINE = 12; //    밀어 넣을 때 남기는 밑줄 최소 길이 (px)

interface Point {
  x: number;
  y: number;
}

export function layoutUnderline(rect: Rect, stage: Size, opts: UnderlineOptions): UnderlineLayout {
  const rand = mulberry32(opts.seed);
  const half = opts.stroke / 2;
  const y = rect.top + rect.height + GAP + half; // 밑줄 중심선
  const x1 = rect.left;
  let x2 = rect.left + rect.width;
  const pushed = { x: 0, y: 0 };

  let starPts: Point[] | undefined;
  if (opts.star) {
    // 별은 선 끝(x2, y)을 기준으로 놓는다: 아래왼쪽 꼭짓점이 선 끝에 닿고 몸통은 선 위로 올라온다
    const pts = starPoints(rand);
    const place = (cx: number, cy: number) => pts.map((p) => ({ x: cx + p.x, y: cy + p.y }));
    starPts = place(x2 + 0.6 * STAR_R, y - 0.7 * STAR_R);

    // 오른쪽 가장자리: 밑줄 끝과 별을 함께 왼쪽으로. 밑줄은 MIN_LINE 까지만 줄어든다
    const over = Math.max(...starPts.map((p) => p.x)) + half - (stage.width - MARGIN);
    if (over > 0) {
      const shift = Math.min(Math.ceil(over), Math.max(0, x2 - (x1 + MIN_LINE)));
      x2 -= shift;
      pushed.x = -shift;
    }
    // 위아래 가장자리: 별만 민다 (밑줄은 박스에 붙어 있어야 한다)
    const top = Math.min(...starPts.map((p) => p.y)) - half;
    const bottom = Math.max(...starPts.map((p) => p.y)) + half;
    if (top < MARGIN) pushed.y = Math.ceil(MARGIN - top);
    else if (bottom > stage.height - MARGIN) pushed.y = -Math.ceil(bottom - (stage.height - MARGIN));
    starPts = place(x2 + 0.6 * STAR_R, y - 0.7 * STAR_R + pushed.y);
  }

  const linePts = linePoints(x1, x2, y, rand);
  const all = starPts ? [...linePts, ...starPts] : linePts;
  const pad = half + 1;
  const left = Math.floor(Math.min(...all.map((p) => p.x)) - pad);
  const top = Math.floor(Math.min(...all.map((p) => p.y)) - pad);
  const right = Math.ceil(Math.max(...all.map((p) => p.x)) + pad);
  const bottom = Math.ceil(Math.max(...all.map((p) => p.y)) + pad);

  return {
    box: { left, top, width: right - left, height: bottom - top },
    line: smoothPath(linePts),
    star: starPts && polylinePath(starPts),
    pushed,
  };
}

/** 밑줄 제어점: x1→x2 를 SEGMENT 간격으로 나누고 y 에 흔들림 + 전체 기울기 */
function linePoints(x1: number, x2: number, y: number, rand: () => number): Point[] {
  const n = Math.max(3, Math.round((x2 - x1) / SEGMENT) + 1);
  const drift = (rand() * 2 - 1) * DRIFT;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: x1 + (x2 - x1) * t, y: y + drift * t + (rand() * 2 - 1) * WOBBLE });
  }
  return pts;
}

/**
 * 한붓그리기 별 (원점 기준). 바깥 꼭짓점을 위(0)부터 시계 방향으로 72° 씩 두고
 * 아래왼쪽(3) → 위(0) → 아래오른쪽(2) → 왼쪽(4) → 오른쪽(1) → 아래왼쪽(3) 순서로 잇는다. 마지막 획은 시작점을 OVERSHOOT 만큼 지나친다.
 */
function starPoints(rand: () => number): Point[] {
  const vertex = (k: number): Point => {
    const a = (Math.PI / 180) * (-90 + 72 * k);
    return {
      x: STAR_R * Math.cos(a) + (rand() * 2 - 1) * STAR_JITTER,
      y: STAR_R * Math.sin(a) + (rand() * 2 - 1) * STAR_JITTER,
    };
  };
  const v = [0, 1, 2, 3, 4].map(vertex);
  const order = [3, 0, 2, 4, 1, 3].map((k) => v[k]);
  const last = order[order.length - 1];
  const prev = order[order.length - 2];
  order.push({ x: last.x + (last.x - prev.x) * OVERSHOOT, y: last.y + (last.y - prev.y) * OVERSHOOT });
  return order;
}

/** 제어점을 지나는 부드러운 곡선: 이웃 제어점의 중점을 끝점으로 하는 2차 베지어의 연속 */
function smoothPath(pts: Point[]): string {
  let d = `M${fmt(pts[0])}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += ` Q${fmt(pts[i])} ${fmt(mid)}`;
  }
  d += ` Q${fmt(pts[pts.length - 2])} ${fmt(pts[pts.length - 1])}`;
  return d;
}

function polylinePath(pts: Point[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p)}`).join(' ');
}

function fmt(p: Point): string {
  return `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`;
}

/** 작은 시드 난수 (mulberry32). 같은 시드면 같은 수열이라 렌더 결과가 재현된다 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
