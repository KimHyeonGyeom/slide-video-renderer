// shake: 오려낸 조각(.cut)이 살짝 떠서 좌우로 짧게 흔들리고 쉬기를 구간 끝까지 반복한다.
(function () {
  var HL = window.HL;
  var PX = 8; //        진폭 (px)
  var ROT = 1.2; //     기울임 (도). 좌우 이동에 살짝 얹어 "흔든다"는 느낌을 준다
  var LIFT = 1.05; //   흔드는 동안 살짝 키워 원본 가장자리를 가린다
  var BURST = 0.6; //   한 번 흔드는 시간 (초): 좌-우-좌-우-복귀
  var REST = 0.5; //    흔든 뒤 쉬는 시간 (초)

  HL.effects.shake = function (tl, o) {
    var sel = '#' + o.domId;
    var wiggle = {
      x: [0, -PX, PX, -PX, PX, 0],
      rotation: [0, -ROT, ROT, -ROT, ROT, 0],
      easeEach: 'sine.inOut',
    };

    HL.cutIn(tl, sel, o);
    tl.to(sel, { scale: LIFT, duration: HL.CUT_IN, ease: 'power1.out' }, o.start);

    var outT = Math.min(HL.CUT_OUT, (o.end - o.start) / 3);
    var t = o.start + HL.CUT_IN;
    var last = o.end - outT;
    if (t + BURST > last) {
      // 구간이 짧으면 한 번만, 남는 시간만큼
      tl.to(sel, { keyframes: wiggle, duration: Math.max(0.1, last - t) }, t);
    } else {
      while (t + BURST <= last) {
        tl.to(sel, { keyframes: wiggle, duration: BURST }, t);
        t += BURST + REST;
      }
    }

    tl.to(sel, { scale: 1, duration: outT, ease: 'power1.inOut' }, o.end - outT);
    HL.cutOut(tl, sel, o);
  };
})();
