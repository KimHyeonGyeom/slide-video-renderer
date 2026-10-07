// 브라우저(HyperFrames headless Chrome)에서 실행된다. Node 코드가 아니다.
// 모든 효과 파일보다 먼저 로드된다. window.HL 네임스페이스에 공통 상수·헬퍼를 두고, 각 효과는 HL.effects[이름] 에 등록한다.
//
// 효과 함수 시그니처: function (tl, o, ctx)
//   tl  : gsap.timeline({ paused: true })  — 여기에 tween 을 추가한다. play()/seek() 직접 호출 금지
//   o   : { id, domId, left, top, width, height, start, end, effect }  (px, 초). '#' + o.domId 가 효과 요소
//   ctx : { width, height }  — 스테이지 크기
// 규칙: wall-clock/setTimeout/무한 반복 금지 (렌더는 프레임을 seek 해서 찍는다)
//
// 요소 종류: box 는 테두리 div(.hl), zoom/shake 는 오려낸 조각(.cut), 나머지(marker·circle·underline·glow·spotlight)는
// 빈 컨테이너(.fx)에 효과 스크립트가 직접 그려 넣는다. 그릴 때 쓰는 헬퍼가 아래 후반부에 있다.
(function () {
  var HL = (window.HL = window.HL || { effects: {} });

  HL.CUT_IN = 0.15; // 오려낸 조각(.cut) 등장 (초). 1배에서는 원본과 같은 그림이라 그림자만 스며든다
  HL.CUT_OUT = 0.4; // 오려낸 조각 퇴장 (초)
  HL.SHORT = 1.2; //   이보다 짧은 구간은 전환 시간을 구간의 1/3 로

  /** 구간이 짧으면 전환 시간을 줄인다 */
  HL.transition = function (base, o) {
    var dur = o.end - o.start;
    return dur < HL.SHORT ? dur / 3 : base;
  };

  /** 조각 등장: 그림자가 스며든다 */
  HL.cutIn = function (tl, sel, o) {
    tl.to(sel, { opacity: 1, duration: HL.CUT_IN, ease: 'power1.out' }, o.start);
  };

  /** 조각 퇴장: 구간 끝에서 천천히 사라진다. 반환값은 퇴장에 쓴 시간 */
  HL.cutOut = function (tl, sel, o) {
    var t = Math.min(HL.CUT_OUT, (o.end - o.start) / 3);
    tl.to(sel, { opacity: 0, duration: t, ease: 'power1.in' }, o.end - t);
    return t;
  };

  // ── .fx 컨테이너에 그리는 효과들의 공통 헬퍼 ─────────────────────────────────────────────
  HL.NS = 'http://www.w3.org/2000/svg';

  HL.f1 = function (v) {
    return v.toFixed(1);
  };

  /** 문자열 → 32bit 시드 (FNV-1a). 모양 난수는 domId 로 시드를 고정한다: 캡처 워커가 여러 개라 페이지를 따로 로드해도 같은 프레임 */
  HL.seedOf = function (s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /** 시드 고정 난수 (mulberry32). 0 이상 1 미만 */
  HL.rng = function (seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** cubic bezier 길이 (24 등분 꺾은선 근사, 실제보다 아주 조금 짧다) */
  function bezierLength(a, c1, c2, b) {
    var len = 0,
      prev = a;
    for (var i = 1; i <= 24; i++) {
      var t = i / 24,
        u = 1 - t;
      var x = u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0];
      var y = u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1];
      len += Math.sqrt((x - prev[0]) * (x - prev[0]) + (y - prev[1]) * (y - prev[1]));
      prev = [x, y];
    }
    return len;
  }

  /**
   * 꺾는 점들을 지나는 부드러운 곡선 (Catmull-Rom → cubic bezier path). 반환: { d, length }.
   * 길이를 path.getTotalLength() 로 재지 않는 이유: 레이아웃에 기대지 않기 위해서 (요소가 아직 display:none 이어도 같은 값)
   */
  HL.curve = function (p) {
    var f1 = HL.f1;
    var d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
    var length = 0;
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i],
        p1 = p[i],
        p2 = p[i + 1],
        p3 = p[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + f1(c1[0]) + ' ' + f1(c1[1]) + ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
      length += bezierLength(p1, c1, c2, p2);
    }
    return { d: d, length: length };
  };

  /** SVG 요소를 만들어 parent 에 붙인다 */
  HL.svg = function (name, attrs, parent) {
    var e = document.createElementNS(HL.NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  /** .fx 컨테이너의 색. 빌더가 요청의 color(없으면 효과별 기본색)를 --color 로 넣는다 */
  HL.fxColor = function (el, fallback) {
    var c = (getComputedStyle(el).getPropertyValue('--color') || '').trim();
    return c || fallback;
  };

  /** '#RRGGBB' → 'rgba(r,g,b,a)' */
  HL.rgba = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  /** 컨테이너를 상자보다 pad 만큼 키운다 (glow, spotlight) */
  HL.pad = function (el, o, pad) {
    el.style.left = o.left - pad + 'px';
    el.style.top = o.top - pad + 'px';
    el.style.width = o.width + 2 * pad + 'px';
    el.style.height = o.height + 2 * pad + 'px';
  };

  /**
   * 컨테이너 안에 상자보다 pad 만큼 큰 SVG 를 넣는다. viewBox 가 스테이지 좌표라 path 는 스테이지 좌표 그대로 쓴다.
   * rough > 0 이면 노이즈 변위 필터로 가장자리를 거칠게 한다 (펜 느낌). 반환: { svg, defs, g } — path 는 g 에 넣는다
   */
  HL.penSvg = function (container, o, pad, rough) {
    var x = o.left - pad,
      y = o.top - pad,
      W = o.width + 2 * pad,
      H = o.height + 2 * pad;
    var svg = HL.svg('svg', { viewBox: x + ' ' + y + ' ' + W + ' ' + H, 'aria-hidden': 'true' }, container);
    svg.style.cssText = 'left:' + -pad + 'px;top:' + -pad + 'px;width:' + W + 'px;height:' + H + 'px';
    var defs = HL.svg('defs', {}, svg);
    var g = HL.svg('g', {}, svg);
    if (rough > 0) {
      var id = container.id + '-f';
      var f = HL.svg(
        'filter',
        { id: id, filterUnits: 'userSpaceOnUse', x: x, y: y, width: W, height: H, 'color-interpolation-filters': 'sRGB' },
        defs,
      );
      HL.svg(
        'feTurbulence',
        { type: 'fractalNoise', baseFrequency: '0.05 0.05', numOctaves: 2, seed: HL.seedOf(container.id) % 1000, result: 'n' },
        f,
      );
      HL.svg(
        'feDisplacementMap',
        { in: 'SourceGraphic', in2: 'n', scale: rough, xChannelSelector: 'R', yChannelSelector: 'G' },
        f,
      );
      g.setAttribute('filter', 'url(#' + id + ')');
    }
    return { svg: svg, defs: defs, g: g };
  };

  /**
   * 획이 처음부터 끝까지 "그어지는" 애니메이션 (stroke-dashoffset). length 는 HL.curve 가 준 값.
   * dash 는 획보다 조금 길어도 된다 (그만큼 아주 조금 일찍 다 그어질 뿐). 짧으면 끝이 잘리므로 1% + 2px 여유
   */
  HL.drawIn = function (tl, path, length, at, dur) {
    var L = Math.ceil(length * 1.01) + 2;
    gsap.set(path, { strokeDasharray: L, strokeDashoffset: L }); // 처음엔 전부 숨김
    tl.to(path, { strokeDashoffset: 0, duration: dur, ease: 'power1.inOut' }, at);
  };
})();
