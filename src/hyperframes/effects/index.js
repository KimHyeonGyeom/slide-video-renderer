// 진입점. 마지막에 로드된다. window.__SLIDE__ (slide-data.js) 를 읽어 타임라인을 만들고 객체마다 효과 함수를 부른 뒤
// window.__timelines[compositionId] 에 등록한다 — HyperFrames 는 이 타임라인을 seek 하며 프레임을 찍는다.
(function () {
  var slide = window.__SLIDE__;
  if (!slide) {
    // 데이터 스크립트가 실행되지 않았다. 페이지의 script 태그를 찍어 원인을 남긴다.
    var tags = Array.prototype.map.call(document.scripts, function (s) {
      return s.src ? 'src=' + s.src : 'inline:' + (s.textContent || '').slice(0, 60).replace(/\s+/g, ' ');
    });
    console.error('[effects] window.__SLIDE__ missing. scripts=' + JSON.stringify(tags));
    return;
  }

  var HL = window.HL;
  var tl = gsap.timeline({ paused: true });
  var ctx = { width: slide.width, height: slide.height };

  slide.objects.forEach(function (o) {
    var effect = HL.effects[o.effect];
    if (!effect) {
      console.error('[effects] unknown effect "' + o.effect + '" for object ' + o.id);
      return;
    }
    effect(tl, o, ctx);
  });

  window.__timelines = window.__timelines || {};
  window.__timelines[slide.compositionId] = tl;
})();
