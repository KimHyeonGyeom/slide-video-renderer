// circle: 펜으로 상자 둘레를 한 바퀴 조금 넘게 둘러 그린다. 요소는 빈 컨테이너(.fx.circle), 둘레 곡선(SVG)은 여기서 그려 넣는다.
// 두 바퀴째는 살짝 바깥으로 벗어나고 반지름이 조금씩 흔들려 손으로 그린 티가 난다. 펜 헬퍼(HL.penSvg, HL.drawIn 등)는 common.js.
(function () {
  var HL = window.HL;
  var PAD_X = [0.1, 16]; //  타원 가로 반지름 = 상자 너비/2 + 너비×0.1 + 16px
  var PAD_Y = [0.25, 12]; // 타원 세로 반지름 = 상자 높이/2 + 높이×0.25 + 12px
  var TURNS = 1.12; //       한 바퀴 + 12% 겹침
  var GROW = 0.04; //        돌수록 바깥으로 (두 바퀴째가 첫 바퀴 밖에 놓인다)
  var WOBBLE = 0.03; //      반지름 흔들림 비율
  var TILT = 0.14; //        타원 기울기 최대 (rad)
  var START = -2.4; //       시작 각 (왼쪽 위), ±0.2 rad 흔들림
  var SAMPLES = 64; //       둘레를 몇 점으로 샘플링할지
  var WIDTH = [0.03, 3, 4, 8]; // 선 굵기 = 높이×0.03 + 3, 4~8px
  var ROUGH = 2.5; //        가장자리 변위 (px)
  var OPACITY = 0.92;
  var DEFAULT_COLOR = '#E8453C';
  var DRAW = 0.7; //         둘러 그리는 시간 (초), 구간의 40% 이내
  var DRAW_MAX_FRAC = 0.4;
  var FADE = 0.3;

  /** 부드러운 잡음: K 개의 제어값을 코사인 보간해 N+1 개 샘플 (-1~1) */
  function smoothNoise(rnd, K, N) {
    var ctrl = [];
    for (var i = 0; i <= K; i++) ctrl.push(rnd() * 2 - 1);
    var out = [];
    for (var j = 0; j <= N; j++) {
      var p = (j / N) * K,
        i0 = Math.floor(p),
        t = p - i0;
      var c0 = ctrl[Math.min(i0, K)],
        c1 = ctrl[Math.min(i0 + 1, K)];
      var m = (1 - Math.cos(t * Math.PI)) / 2;
      out.push(c0 * (1 - m) + c1 * m);
    }
    return out;
  }

  /** 상자 → 둘레 곡선 { d, length }. DOM 을 쓰지 않는 순수 함수라 pen-effects.spec.ts 가 검증한다 */
  HL.circlePath = function (o) {
    var rnd = HL.rng(HL.seedOf(o.domId));
    var w = o.width,
      h = o.height;
    var a = w / 2 + w * PAD_X[0] + PAD_X[1],
      b = h / 2 + h * PAD_Y[0] + PAD_Y[1];
    var cx = o.left + w / 2,
      cy = o.top + h / 2;
    var phi = (rnd() - 0.5) * TILT;
    var n1 = smoothNoise(rnd, 7, SAMPLES),
      n2 = smoothNoise(rnd, 7, SAMPLES);
    var th0 = START + (rnd() - 0.5) * 0.4;
    var pts = [];
    for (var i = 0; i <= SAMPLES; i++) {
      var u = i / SAMPLES,
        th = th0 + u * Math.PI * 2 * TURNS;
      var grow = 1 + GROW * u;
      var rx = a * grow * (1 + WOBBLE * n1[i]),
        ry = b * grow * (1 + WOBBLE * n2[i]);
      var x = rx * Math.cos(th),
        y = ry * Math.sin(th);
      pts.push([cx + x * Math.cos(phi) - y * Math.sin(phi), cy + x * Math.sin(phi) + y * Math.cos(phi)]);
    }
    return HL.curve(pts);
  };

  HL.effects.circle = function (tl, o) {
    var sel = '#' + o.domId;
    var container = document.querySelector(sel);
    var cv = HL.circlePath(o);
    // 타원이 커지고 흔들리는 만큼(GROW + WOBBLE)과 변위 여백까지 SVG 를 키운다
    var pad = Math.ceil(Math.max(o.width * (PAD_X[0] + 0.02) + PAD_X[1], o.height * (PAD_Y[0] + 0.05) + PAD_Y[1]) + 20);
    var width = Math.max(WIDTH[2], Math.min(WIDTH[3], o.height * WIDTH[0] + WIDTH[1]));
    var p = HL.svg(
      'path',
      {
        d: cv.d,
        fill: 'none',
        stroke: HL.fxColor(container, DEFAULT_COLOR),
        'stroke-width': HL.f1(width),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-opacity': OPACITY,
      },
      HL.penSvg(container, o, pad, ROUGH).g,
    );

    var dur = o.end - o.start;
    var draw = Math.min(DRAW, dur * DRAW_MAX_FRAC);
    var fade = HL.transition(FADE, o);
    tl.set(sel, { opacity: 1 }, o.start);
    HL.drawIn(tl, p, cv.length, o.start, draw);
    tl.to(sel, { opacity: 0, duration: fade, ease: 'power1.in' }, o.end - fade);
  };
})();
