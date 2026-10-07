// spotlight: 상자만 남기고 화면 전체를 어둡게 덮는다. 요소는 빈 컨테이너(.fx.spotlight)이고, 컨테이너가 "구멍"이며 거대한
// box-shadow 가 바깥을 덮는다 (#stage 가 overflow:hidden 이라 스테이지 밖은 잘린다). 카메라 조리개처럼 살짝 조여들며 나타난다.
// 같은 시간에 두 객체에 걸면 서로의 상자를 어둡게 하므로 요청에서 겹치지 않게 한다. color 는 쓰지 않는다.
(function () {
  var HL = window.HL;
  var PAD = 14; //     상자보다 이만큼 크게
  var RADIUS = 12; //  모서리 (px)
  var DIM = 0.55; //   바깥 어둡기 (0~1)
  var EDGE = 0.35; //  구멍 가장자리의 밝은 선 불투명도
  var IRIS = 1.06; //  등장 시작 배율 (조여든다)
  var IN = 0.4; //     등장 (초)
  var OUT = 0.35; //   퇴장 (초)

  HL.effects.spotlight = function (tl, o) {
    var sel = '#' + o.domId;
    var container = document.querySelector(sel);
    HL.pad(container, o, PAD);
    container.style.borderRadius = RADIUS + 'px';
    container.style.boxShadow = '0 0 0 2px rgba(255,255,255,' + EDGE + '), 0 0 0 4000px rgba(0,0,0,' + DIM + ')';

    var fadeIn = HL.transition(IN, o),
      fadeOut = HL.transition(OUT, o);
    tl.fromTo(sel, { opacity: 0, scale: IRIS }, { opacity: 1, scale: 1, duration: fadeIn, ease: 'power2.out' }, o.start);
    tl.to(sel, { opacity: 0, duration: fadeOut, ease: 'power1.in' }, o.end - fadeOut);
  };
})();
