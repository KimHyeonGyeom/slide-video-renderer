// underline: 객체 아래에 손으로 그은 듯한 밑줄(svg .ul-line)이 왼쪽에서 오른쪽으로 그려진다.
// underline-star: 밑줄이 끝나면 그 끝에서 별(.ul-star)이 한 획으로 이어 그려진다. 둘 다 구간 끝에서 페이드로 사라진다 (거꾸로 지우지 않는다).
// 모양(위치, 흔들림, 별 크기, 가장자리 밀어넣기)은 서버(underline.layout.ts)가 path 로 만들어 두고, 여기는 그리는 시간만 다룬다.
// "그려지는" 효과: path 에 pathLength="100" 이 있어 점선 100 = 전체 길이. 오프셋을 100→0 으로 줄이면 펜이 지나가듯 드러난다.
// (CSS 가 초기 오프셋 100 을 둔다. 길이를 DOM 에서 재지 않으므로 요소가 아직 그려지지 않았어도 된다)
(function () {
  var HL = window.HL;
  var SPEED = 3000; //   밑줄 긋는 속도 (px/초). 객체 너비/속도 를 아래 범위로 자른다
  var LINE_MIN = 0.4; // 밑줄 긋는 시간 하한 (초)
  var LINE_MAX = 0.6; // 밑줄 긋는 시간 상한 (초)
  var STAR = 0.3; //     별 한 획 (초)
  var FADE = 0.3; //     퇴장 페이드 (초)

  function underline(tl, o) {
    var sel = '#' + o.domId;
    var line = sel + ' .ul-line';
    var star = document.querySelector(sel + ' .ul-star');
    var dur = o.end - o.start;

    var lineT = Math.min(LINE_MAX, Math.max(LINE_MIN, o.width / SPEED));
    var starT = star ? STAR : 0;
    var outT = FADE;
    if (dur < HL.SHORT) {
      // 짧은 구간: 다른 효과처럼 전환을 구간의 1/3 로. 그리기(밑줄+별) 1/3, 유지 1/3, 페이드 1/3
      var k = dur / 3 / (lineT + starT);
      lineT *= k;
      starT *= k;
      outT = dur / 3;
    }

    tl.set(sel, { opacity: 1 }, o.start);
    tl.to(line, { strokeDashoffset: 0, duration: lineT, ease: 'power2.out' }, o.start);
    if (star) {
      tl.to(star, { strokeDashoffset: 0, duration: starT, ease: 'power1.inOut' }, o.start + lineT);
    }
    tl.to(sel, { opacity: 0, duration: outT, ease: 'power1.in' }, o.end - outT);
  }

  HL.effects.underline = underline;
  HL.effects['underline-star'] = underline;
})();
