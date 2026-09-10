// zoom: 슬라이드에서 객체 영역만 오려낸 조각(.cut)이 제자리에서 서서히 커졌다가 끝에 되돌아온다. 배경은 움직이지 않는다.
// zoom-box: 같은 동작 + 조각에 테두리 링. 링은 CSS(.cut.ring)라 JS 는 zoom 과 같다.
(function () {
  var HL = window.HL;
  var SCALE = 1.18; //    최종 배율. 화면 밖으로 나가면 자동으로 줄인다
  var MARGIN = 16; //     커진 조각이 화면 가장자리에서 유지할 여백 (px)
  var GROW_MAX = 1.5; //  커지는 데 쓰는 최대 시간 (초). 구간의 절반, 최소 0.4초
  var BACK = 0.5; //      끝에서 원래 크기로 돌아가는 시간 (초). 그 동안 겹쳐서 사라진다

  function zoom(tl, o, ctx) {
    var sel = '#' + o.domId;
    var W = ctx.width,
      H = ctx.height;
    var dur = o.end - o.start;

    // 배율: 커진 뒤에도 화면 안에 들어가도록 제한
    var s = Math.min(SCALE, (W - 2 * MARGIN) / o.width, (H - 2 * MARGIN) / o.height);
    s = Math.max(1, s);
    // 중심 기준으로 커진 사각형이 화면 밖으로 나가는 만큼 안쪽으로 밀어 넣는다
    var cx = o.left + o.width / 2,
      cy = o.top + o.height / 2;
    var hw = (o.width * s) / 2,
      hh = (o.height * s) / 2;
    var dx = 0,
      dy = 0;
    if (cx - hw < MARGIN) dx = MARGIN - (cx - hw);
    else if (cx + hw > W - MARGIN) dx = W - MARGIN - (cx + hw);
    if (cy - hh < MARGIN) dy = MARGIN - (cy - hh);
    else if (cy + hh > H - MARGIN) dy = H - MARGIN - (cy + hh);

    var back = Math.min(BACK, dur * 0.3);
    var grow = Math.min(GROW_MAX, Math.max(0.4, dur * 0.5), dur - back - HL.CUT_IN);

    HL.cutIn(tl, sel, o);
    tl.to(sel, { scale: s, x: dx, y: dy, duration: grow, ease: 'power2.out' }, o.start);
    tl.to(sel, { scale: 1, x: 0, y: 0, duration: back, ease: 'power2.inOut' }, o.end - back);
    HL.cutOut(tl, sel, o);
  }

  HL.effects.zoom = zoom;
  HL.effects['zoom-box'] = zoom;
})();
