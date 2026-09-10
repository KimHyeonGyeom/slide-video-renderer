// box: 객체 주위 테두리(.hl)가 페이드 인/아웃. 요소는 composition.builder 가 만든 테두리 div.
(function () {
  var FADE = 0.25; // 페이드 인/아웃 (초)

  window.HL.effects.box = function (tl, o) {
    var t = window.HL.transition(FADE, o);
    var sel = '#' + o.domId;
    tl.to(sel, { opacity: 1, duration: t, ease: 'power1.out' }, o.start);
    tl.to(sel, { opacity: 0, duration: t, ease: 'power1.in' }, o.end - t);
  };
})();
