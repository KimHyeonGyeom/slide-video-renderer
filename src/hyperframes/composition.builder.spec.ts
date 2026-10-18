import { describe, expect, it } from 'vitest';
import { CompositionBuilder, DEFAULT_HIGHLIGHT_COLOR, type PxObject } from './composition.builder.js';

const base = {
  inputs: { slide: '/tmp/in/slide.jpg', audio: '/tmp/in/audio.mp3' },
  durationSec: 10.4,
  width: 1920,
  height: 1080,
  fps: 30,
};
const box: PxObject = { id: 'a', domId: 'hl-0', left: 132, top: 58, width: 1656, height: 209, start: 0.5, end: 3, effect: 'box' };
const zoom: PxObject = { ...box, id: 'b', domId: 'hl-1', effect: 'zoom-box', color: '#00FF00' };
const underline: PxObject = { ...box, id: 'c', domId: 'hl-2', effect: 'underline-star' };

describe('CompositionBuilder', () => {
  it('index.html, 데이터 스크립트, 입력·정적 자산을 assets/ 이름과 함께 돌려준다', async () => {
    const { files } = await new CompositionBuilder().build({ ...base, objects: [box] });
    const paths = files.map((f) => f.path);
    expect(paths.slice(0, 5)).toEqual([
      'index.html',
      'assets/slide-data.js',
      'assets/slide.jpg',
      'assets/audio.mp3',
      'assets/gsap.min.js',
    ]);
    expect(files.find((f) => f.path === 'assets/slide.jpg')?.copyFrom).toBe('/tmp/in/slide.jpg');
  });

  it('효과 스크립트는 common.js → 효과 파일들 → index.js 순서로 복사되고 같은 순서로 로드된다', async () => {
    const { files } = await new CompositionBuilder().build({ ...base, objects: [box] });
    const effects = files.map((f) => f.path).filter((p) => p.startsWith('assets/effects/'));
    expect(effects[0]).toBe('assets/effects/common.js');
    expect(effects[effects.length - 1]).toBe('assets/effects/index.js');
    expect(effects).toEqual(
      expect.arrayContaining(['assets/effects/box.js', 'assets/effects/zoom.js', 'assets/effects/shake.js']),
    );
    const html = files[0].content!;
    expect(html.indexOf('effects/common.js')).toBeLessThan(html.indexOf('effects/box.js'));
    expect(html.indexOf('effects/box.js')).toBeLessThan(html.indexOf('effects/index.js'));
    expect(html.indexOf('slide-data.js')).toBeLessThan(html.indexOf('effects/common.js'));
  });

  it('루트 duration 은 음성 길이이고 입력은 원본 확장자로 참조된다', async () => {
    const { files } = await new CompositionBuilder().build({ ...base, objects: [box] });
    const html = files[0].content!;
    expect(html).toContain('data-duration="10.4"');
    expect(html).toContain('src="./assets/slide.jpg"');
    expect(html).toContain('src="./assets/audio.mp3"');
    expect(html).toContain('data-width="1920"');
  });

  it('box 는 테두리 div, zoom-box 는 배경을 오려낸 조각 div 에 링 색을 넣는다', async () => {
    const { files } = await new CompositionBuilder().build({ ...base, objects: [box, zoom] });
    const html = files[0].content!;
    expect(html).toContain(`id="hl-0" class="clip hl"`);
    expect(html).toContain(`border-color:${DEFAULT_HIGHLIGHT_COLOR}`);
    expect(html).toContain(`id="hl-1" class="clip cut ring"`);
    expect(html).toContain('background-position:-132px -58px');
    expect(html).toContain('--ring:#00FF00');
  });

  it('데이터 스크립트는 인라인이 아닌 외부 파일이다 (컴파일러가 인라인을 body 끝으로 옮김)', async () => {
    const { files } = await new CompositionBuilder().build({ ...base, objects: [box] });
    expect(files[0].content).not.toContain('window.__SLIDE__');
    expect(files[1].content).toMatch(/^window\.__SLIDE__ = \{/);
  });

  it('underline 계열은 밑줄(+별) path 를 담은 svg 이고 색은 color 로 들어간다', async () => {
    const { files, warnings } = await new CompositionBuilder().build({
      ...base,
      objects: [underline, { ...underline, domId: 'hl-3', effect: 'underline', color: '#0000FF' }],
    });
    const html = files[0].content!;
    expect(html).toMatch(
      /<svg id="hl-2" class="clip ul" data-start="0.5" data-duration="2.500"[^>]*viewBox="(-?\d+ ){3}\d+"[^>]*color:#FF3B30">/,
    );
    expect(html).toContain('<path class="ul-line" pathLength="100" d="M132,');
    expect(html.match(/<path class="ul-star"/g)).toHaveLength(1); // underline 에는 별이 없다
    expect(html).toMatch(/<svg id="hl-3"[^>]*color:#0000FF">/);
    expect(html).toContain('effects/underline.js');
    expect(warnings).toEqual([]);
  });

  it('별이 슬라이드 가장자리를 넘으면 안쪽으로 밀고 warnings 에 남긴다', async () => {
    const edge: PxObject = { ...underline, left: 1300, width: 600 }; // 오른쪽 변 1900
    const { warnings } = await new CompositionBuilder().build({ ...base, objects: [edge] });
    expect(warnings).toEqual([expect.stringMatching(/^object 'c': star pushed \d+px left to stay inside the slide$/)]);
  });
});
