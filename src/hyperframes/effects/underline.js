// underline: 상자 아래쪽에 손글씨 밑줄 한 줄을 왼쪽에서 오른쪽으로 긋는다. 형광펜(marker)이 무거울 때 쓰는 가벼운 강조.
// 요소는 빈 컨테이너(.fx.underline), 선(SVG)은 여기서 그려 넣는다. 펜 헬퍼는 common.js.
(function () {
  var HL = window.HL;
  var AT = 0.9; //          밑줄 y = 상자 위 + 높이 × 이 값 (글자 밑선 바로 아래)
  var OVERSHOOT = [2, 6, 2, 10]; // 왼쪽 2~8px, 오른쪽 2~12px 지나쳐 긋는다
  var SEGMENT = 200; //     곡선 꺾는 점 간격 (px)
  var WOBBLE = 2.2; //      구불거림 진폭 (px)
  var TILT = 6; //          양끝 높이차 최대 (px)
  var WIDTH = [0.07, 4, 9]; // 선 굵기 = 높이 × 0.07, 4~9px
  var ROUGH = 2.5; //       가장자리 변위 (px)
  var OPACITY = 0.92;
  var DEFAULT_COLOR = '#E8453C';
  var DRAW = 0.45; //       긋는 시간 (초), 구간의 35% 이내
  var DRAW_MAX_FRAC = 0.35;
  var FADE = 0.3;

  /** 상자 → 밑줄 곡선 { d, length }. DOM 을 쓰지 않는 순수 함수라 pen-effects.spec.ts 가 검증한다 */
  HL.underlinePath = function (o) {
    var rnd = HL.rng(HL.seedOf(o.domId));
    var y = o.top + o.height * AT;
    var x0 = o.left - OVERSHOOT[0] - rnd() * OVERSHOOT[1];
    var x1 = o.left + o.width + OVERSHOOT[2] + rnd() * OVERSHOOT[3];
    var k = Math.max(3, Math.round((x1 - x0) / SEGMENT));
    var tilt = (rnd() - 0.5) * TILT;
    var pts = [];
    for (var j = 0; j <= k; j++) {
      var t = j / k;
      pts.push([x0 + (x1 - x0) * t, y + tilt * (t - 0.5) + (rnd() - 0.5) * WOBBLE * 2]);
    }
    return HL.curve(pts);
  };

  HL.effects.underline = function (tl, o) {
    var sel = '#' + o.domId;
    var container = document.querySelector(sel);
    var cv = HL.underlinePath(o);
    var width = Math.max(WIDTH[1], Math.min(WIDTH[2], o.height * WIDTH[0]));
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
      HL.penSvg(container, o, 24, ROUGH).g,
    );

    var dur = o.end - o.start;
    var draw = Math.min(DRAW, dur * DRAW_MAX_FRAC);
    var fade = HL.transition(FADE, o);
    tl.set(sel, { opacity: 1 }, o.start);
    HL.drawIn(tl, p, cv.length, o.start, draw);
    tl.to(sel, { opacity: 0, duration: fade, ease: 'power1.in' }, o.end - fade);
  };
})();
