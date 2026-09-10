// 브라우저(HyperFrames headless Chrome)에서 실행된다. Node 코드가 아니다.
// 모든 효과 파일보다 먼저 로드된다. window.HL 네임스페이스에 공통 상수·헬퍼를 두고, 각 효과는 HL.effects[이름] 에 등록한다.
//
// 효과 함수 시그니처: function (tl, o, ctx)
//   tl  : gsap.timeline({ paused: true })  — 여기에 tween 을 추가한다. play()/seek() 직접 호출 금지
//   o   : { id, domId, left, top, width, height, start, end, effect }  (px, 초). '#' + o.domId 가 효과 요소
//   ctx : { width, height }  — 스테이지 크기
// 규칙: wall-clock/setTimeout/무한 반복 금지 (렌더는 프레임을 seek 해서 찍는다)
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
})();
