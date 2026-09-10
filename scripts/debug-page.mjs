// 컴포지션 페이지(work/<jobId>/index.html)를 puppeteer 로 열어 타임라인 등록 여부, 콘솔 에러, 시점별 효과 상태를 찍는다.
// 사용: node scripts/debug-page.mjs work/<jobId>/index.html [초 초 ...]   (기본 0 1.5 5 8)
// 렌더 없이 "효과가 왜 안 보이나"를 진단할 때 쓴다. 실패한 렌더의 작업 폴더는 개발 환경에서 work/<jobId> 에 남는다.
import puppeteer from 'puppeteer';
import path from 'node:path';

const [fileArg, ...timeArgs] = process.argv.slice(2);
if (!fileArg) {
  console.error('usage: node scripts/debug-page.mjs work/<jobId>/index.html [t1 t2 ...]');
  process.exit(1);
}
const file = path.resolve(fileArg);
const times = timeArgs.length ? timeArgs.map(Number) : [0, 1.5, 5, 8];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', (r) => {
  if (r.status() >= 400) console.log('[http', r.status() + ']', r.url());
});

await page.goto('file://' + file, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 500));

const info = await page.evaluate((probeTimes) => {
  const slide = window.__SLIDE__;
  const tl = (window.__timelines || {})[slide?.compositionId ?? 'slide'];
  // 시점마다 각 효과 요소의 opacity / transform
  const probe = (t) => {
    tl.seek(t, false);
    const elements = {};
    for (const o of slide.objects) {
      const el = document.getElementById(o.domId);
      if (!el) continue;
      const cs = getComputedStyle(el);
      elements[`${o.id}(${o.effect})`] = { opacity: cs.opacity, transform: cs.transform };
    }
    return { t, elements };
  };
  return {
    gsap: typeof gsap,
    slideData: !!slide,
    effects: Object.keys((window.HL && window.HL.effects) || {}),
    timelines: Object.keys(window.__timelines || {}),
    duration: tl && tl.duration(),
    tweens: tl && tl.getChildren().length,
    probes: tl && slide ? probeTimes.map(probe) : null,
  };
}, times);
console.log(JSON.stringify(info, null, 2));
await browser.close();
