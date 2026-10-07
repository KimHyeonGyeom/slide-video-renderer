// marker: 객체 상자 위에 형광펜을 긋는다. 요소는 composition.builder 가 만든 빈 컨테이너(.fx.marker)이고 획(SVG)은 여기서 그려 넣는다.
// - 획 중심선은 살짝 기울고 구불구불한 곡선. 가장자리는 노이즈 변위 필터로 울퉁불퉁하게, 알파에 가로로 긴 노이즈를 곱해 마른 자국
// - 넓고 높은 상자는 여러 줄 텍스트로 보고 줄마다 획을 나눠 긋는다. 모든 획은 왼쪽에서 오른쪽으로. 서버는 글자 위치를 모르고 상자만 안다
// - 모양을 정하는 난수는 domId 로 시드를 고정한다 (HL.seedOf). 캡처 워커가 여러 개라서 페이지를 따로 로드해도 같은 프레임이 나와야 한다
// - 등장: 왼쪽에서 오른쪽으로 그어진다 (HL.drawIn). 퇴장: box 처럼 페이드. 색은 컨테이너의 --color (빌더가 기본색을 넣는다)
(function () {
  var HL = window.HL;

  // 획 나누기
  var LINE_H = 62; //           줄 높이 추정 (px, 1080p). 상자 높이를 이 값으로 나눠 획 개수를 정한다
  var MULTI_MIN_ASPECT = 2.4; // 너비/높이가 이 값 이상이고 높이가 LINE_H 의 1.5배 이상(반올림한 줄 수 ≥ 2)이면 여러 줄 텍스트로 본다.
  //                            큰 숫자 하나처럼 좁고 높은 상자는 한 획
  // 획 모양
  var WIDTH_SINGLE = 0.92; //   한 획 굵기 = 상자 높이 × 이 값
  var WIDTH_MULTI = 1.12; //    여러 획 굵기 = 줄 높이 × 이 값 (이웃 획과 조금 겹친다)
  var MIN_WIDTH = 14; //        굵기 하한 (px)
  var OVERSHOOT = 0.18; //      글자 끝을 지나쳐 긋는 길이 = 굵기 × 이 값 + 6px, 양끝 각각 0.6~1.4배
  var WOBBLE = 0.07; //         구불거림 진폭 = 굵기 × 이 값
  var TILT = 0.22; //           기울기(양끝 높이차 최대) = 굵기 × 이 값
  var SEGMENT = 220; //         곡선 꺾는 점 간격 (px)
  var ROUGH = 7; //             가장자리 변위 (px)
  var STREAK = 0.4; //          마른 자국 세기 (0 = 없음 … 0.9 = 거의 마른 펜)
  var OPACITY = 0.75; //        획 불투명도. multiply 라 글자는 이 값과 무관하게 읽힌다
  var EDGE_INK = [1, 0.84, 0.78]; // 획의 위아래 끝 · 그 안쪽 · 가운데 농도 (잉크가 가장자리에 고인 느낌)
  var DEFAULT_COLOR = '#FFE23A';
  // 타이밍
  var DRAW_SINGLE = 0.5; //     한 획을 긋는 시간 (초)
  var DRAW_MULTI_BASE = 0.42; // 여러 획 전체 시간 = BASE + PER × 획 수
  var DRAW_MULTI_PER = 0.26;
  var DRAW_MAX_FRAC = 0.45; //  긋는 시간은 구간 길이의 이 비율까지
  var NEXT_AT = 0.78; //        다음 획은 앞 획이 이 비율만큼 그어졌을 때 시작
  var FADE = 0.3; //            퇴장 페이드 (초). 짧은 구간에서는 HL.transition 이 줄인다

  /**
   * 상자 → 획 목록. DOM 을 쓰지 않는 순수 함수라 marker.spec.ts 가 검증한다.
   * o: { domId, left, top, width, height } (px). 반환: [{ d, length, width, yc }] — d 는 스테이지 좌표의 path, length 는 그 길이, width 는 굵기, yc 는 중심 y.
   * 모든 획은 왼쪽에서 오른쪽으로 긋는다 (d 의 시작점이 왼쪽 끝).
   */
  HL.markerStrokes = function (o) {
    var rnd = HL.rng(HL.seedOf(o.domId));
    var n = 1;
    if (o.width / o.height >= MULTI_MIN_ASPECT) n = Math.max(1, Math.round(o.height / LINE_H));
    var band = o.height / n;
    var w = Math.max(MIN_WIDTH, n === 1 ? o.height * WIDTH_SINGLE : band * WIDTH_MULTI);
    var over = w * OVERSHOOT + 6;
    var strokes = [];
    for (var i = 0; i < n; i++) {
      var yc = o.top + band * (i + 0.5) + (rnd() - 0.5) * band * 0.08;
      var x0 = o.left - over * (0.6 + rnd() * 0.8);
      var x1 = o.left + o.width + over * (0.6 + rnd() * 0.8);
      var len = x1 - x0;
      var k = Math.max(3, Math.round(len / SEGMENT));
      var amp = w * WOBBLE;
      var tilt = (rnd() - 0.5) * w * TILT;
      var pts = [];
      for (var j = 0; j <= k; j++) {
        var t = j / k;
        var end = j === 0 || j === k;
        pts.push([x0 + len * t, yc + tilt * (t - 0.5) + (rnd() - 0.5) * (end ? amp * 0.6 : amp * 2)]);
      }
      var c = HL.curve(pts);
      strokes.push({ d: c.d, length: c.length, width: w, yc: yc });
    }
    return strokes;
  };

  /** 컨테이너 안에 SVG(필터·그라데이션·획)를 그려 넣고 path 요소들을 돌려준다 */
  function paint(container, o, strokes, color) {
    var f1 = HL.f1;
    var seed = HL.seedOf(o.domId) % 1000;
    var maxW = 0;
    strokes.forEach(function (s) {
      if (s.width > maxW) maxW = s.width;
    });
    var pad = Math.ceil(maxW * 0.6 + ROUGH * 2 + 24); // 지나쳐 긋는 길이 + 변위 필터 여백
    var x = o.left - pad,
      y = o.top - pad,
      W = o.width + 2 * pad,
      H = o.height + 2 * pad;
    var id = o.domId;
    // HL.penSvg 를 쓰지 않는 이유: 형광펜은 변위에 더해 마른 자국(알파 노이즈)까지 넣는 전용 필터를 쓴다
    var svg = HL.svg('svg', { viewBox: x + ' ' + y + ' ' + W + ' ' + H, 'aria-hidden': 'true' }, container);
    svg.style.cssText = 'left:' + -pad + 'px;top:' + -pad + 'px;width:' + W + 'px;height:' + H + 'px';
    var defs = HL.svg('defs', {}, svg);

    // 필터: 노이즈로 가장자리를 밀어 울퉁불퉁하게 → 가로로 긴 노이즈의 R 을 알파로 곱해 마른 자국
    // alpha = (1 − STREAK) + 1.6·STREAK·R : 밝은 곳은 그대로, 어두운 곳은 옅게
    var filter = HL.svg(
      'filter',
      { id: id + '-f', filterUnits: 'userSpaceOnUse', x: x, y: y, width: W, height: H, 'color-interpolation-filters': 'sRGB' },
      defs,
    );
    HL.svg(
      'feTurbulence',
      { type: 'fractalNoise', baseFrequency: '0.028 0.055', numOctaves: 2, seed: seed, result: 'edge' },
      filter,
    );
    HL.svg(
      'feDisplacementMap',
      { in: 'SourceGraphic', in2: 'edge', scale: ROUGH, xChannelSelector: 'R', yChannelSelector: 'G', result: 'rough' },
      filter,
    );
    HL.svg(
      'feTurbulence',
      { type: 'fractalNoise', baseFrequency: '0.004 0.16', numOctaves: 3, seed: seed + 7, result: 'tex' },
      filter,
    );
    HL.svg(
      'feColorMatrix',
      {
        in: 'tex',
        type: 'matrix',
        values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ' + (1.6 * STREAK).toFixed(3) + ' 0 0 0 ' + (1 - STREAK).toFixed(3),
        result: 'texA',
      },
      filter,
    );
    HL.svg('feComposite', { in: 'rough', in2: 'texA', operator: 'in' }, filter);

    var g = HL.svg('g', { filter: 'url(#' + id + '-f)' }, svg);
    return strokes.map(function (s, j) {
      // 획마다 세로 그라데이션: 위아래 가장자리가 조금 진하다
      var gid = id + '-g' + j;
      var grad = HL.svg(
        'linearGradient',
        { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: f1(s.yc - s.width / 2), x2: 0, y2: f1(s.yc + s.width / 2) },
        defs,
      );
      [
        [0, EDGE_INK[0]],
        [0.18, EDGE_INK[1]],
        [0.5, EDGE_INK[2]],
        [0.82, EDGE_INK[1]],
        [1, EDGE_INK[0]],
      ].forEach(function (st) {
        HL.svg('stop', { offset: st[0], 'stop-color': color, 'stop-opacity': st[1] }, grad);
      });
      return HL.svg(
        'path',
        {
          d: s.d,
          fill: 'none',
          stroke: 'url(#' + gid + ')',
          'stroke-opacity': OPACITY,
          'stroke-width': f1(s.width),
          'stroke-linecap': 'butt', // 납작한 펜촉
          'stroke-linejoin': 'round',
        },
        g,
      );
    });
  }

  HL.effects.marker = function (tl, o) {
    var sel = '#' + o.domId;
    var container = document.querySelector(sel);
    var strokes = HL.markerStrokes(o);
    var paths = paint(container, o, strokes, HL.fxColor(container, DEFAULT_COLOR));

    var dur = o.end - o.start;
    var drawT = Math.min(paths.length === 1 ? DRAW_SINGLE : DRAW_MULTI_BASE + DRAW_MULTI_PER * paths.length, dur * DRAW_MAX_FRAC);
    var fade = HL.transition(FADE, o);
    var per = drawT / (1 + (paths.length - 1) * NEXT_AT);

    tl.set(sel, { opacity: 1 }, o.start);
    paths.forEach(function (p, k) {
      HL.drawIn(tl, p, strokes[k].length, o.start + k * per * NEXT_AT, per);
    });
    tl.to(sel, { opacity: 0, duration: fade, ease: 'power1.in' }, o.end - fade);
  };
})();
