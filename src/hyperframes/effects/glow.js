// glow: 상자 둘레에 부드러운 빛 테두리가 숨 쉬듯 커졌다 작아진다. 약한 단계의 강조. 요소는 빈 컨테이너(.fx.glow)이고 그림자는 CSS.
(function () {
  var HL = window.HL;
  var PAD = 10; //        상자보다 이만큼 크게
  var RADIUS = 14; //     모서리 (px)
  var RING = 2; //        선명한 테두리 두께 (px)
  var HALO = [30, 12, 0.55]; // 번지는 빛: blur, spread (px), 불투명도
  var FILL = 0.1; //      안쪽 채움 불투명도
  var DEFAULT_COLOR = '#FFB300';
  var IN = 0.3; //        등장 페이드 (초)
  var OUT = 0.3; //       퇴장 페이드 (초)
  var PULSE = 0.45; //    숨 한 번(커지거나 작아지는) 시간 (초)
  var SCALE = 1.03; //    숨 쉴 때 최대 배율

  HL.effects.glow = function (tl, o) {
    var sel = '#' + o.domId;
    var container = document.querySelector(sel);
    var color = HL.fxColor(container, DEFAULT_COLOR);
    HL.pad(container, o, PAD);
    container.style.borderRadius = RADIUS + 'px';
    container.style.boxShadow =
      '0 0 0 ' + RING + 'px ' + color + ', 0 0 ' + HALO[0] + 'px ' + HALO[1] + 'px ' + HL.rgba(color, HALO[2]);
    container.style.background = HL.rgba(color, FILL);

    var dur = o.end - o.start;
    var fadeIn = HL.transition(IN, o),
      fadeOut = HL.transition(OUT, o);
    var avail = dur - fadeIn - fadeOut;
    tl.to(sel, { opacity: 1, duration: fadeIn, ease: 'power1.out' }, o.start);
    if (avail >= 2 * PULSE) {
      // 홀수 번 반복(yoyo) → 원래 크기로 끝난다
      var n = Math.max(1, 2 * Math.floor(avail / (2 * PULSE)) - 1);
      tl.to(sel, { scale: SCALE, duration: PULSE, ease: 'sine.inOut', yoyo: true, repeat: n }, o.start + fadeIn);
    }
    tl.to(sel, { opacity: 0, duration: fadeOut, ease: 'power1.in' }, o.end - fadeOut);
  };
})();
