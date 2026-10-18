import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutUnderline, type Size } from './underline.layout.js';

export type Effect = 'box' | 'zoom' | 'shake' | 'zoom-box' | 'underline' | 'underline-star';

/** px 로 변환된 객체. effects/index.js 가 window.__SLIDE__.objects 로 받는 형태 */
export interface PxObject {
  id: string;
  /** 효과 요소의 id. box 는 테두리 div(.hl), underline 계열은 svg(.ul), 나머지는 오려낸 조각 div(.cut) */
  domId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  start: number;
  end: number;
  effect: Effect;
  /** 테두리·선 색. 없으면 DEFAULT_HIGHLIGHT_COLOR */
  color?: string;
}

/**
 * 컴포지션이 필요로 하는 입력의 이름. 요청 JSON 의 필드명과는 무관한 내부 이름이다.
 * 요청 필드 ↔ 이 이름의 대응은 RenderService 한 줄(fetchInputs 호출)에만 있다.
 */
export type InputKind = 'slide' | 'audio';
/** 입력 이름 → 로컬 파일 경로 (workspace 가 받아둔 것) */
export type RenderInputs = Record<InputKind, string>;

export interface CompositionInput {
  inputs: RenderInputs;
  objects: PxObject[];
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

/** 프로젝트 폴더에 만들 파일 하나. content 를 쓰거나 copyFrom 을 복사한다 */
export interface CompositionFile {
  /** 프로젝트 폴더 기준 상대 경로 (index.html, assets/...) */
  path: string;
  content?: string;
  copyFrom?: string;
}

export interface Composition {
  files: CompositionFile[];
  /** 요청은 받아들이되 알려야 할 것 (별을 가장자리 안쪽으로 민 경우 등). 응답 warnings 에 실린다 */
  warnings: string[];
}

/** 강조 테두리·선의 기본색과 두께. 요청의 color 가 없을 때 쓴다 (설정이 아니라 디자인 값) */
export const DEFAULT_HIGHLIGHT_COLOR = '#FF3B30';
export const BORDER_PX = 6;

/**
 * 효과별로 어떤 요소를 만들지. 새 효과를 추가할 때 여기에 한 줄, effects/<이름>.js 에 함수 하나, DTO 의 EFFECTS 에 이름 하나.
 * - box: 객체 위치에 테두리 div (.hl)
 * - cut: 슬라이드 이미지를 배경으로 깔고 객체 영역만 보이게 자른 조각 div (.cut). 조각만 transform 되므로 배경은 그대로
 * - underline: 객체 아래 밑줄(+별) path 를 담은 svg (.ul). 모양은 underline.layout.ts 가 정한다
 */
const ELEMENT_KIND: Record<Effect, 'box' | 'cut' | 'underline'> = {
  box: 'box',
  zoom: 'cut',
  shake: 'cut',
  'zoom-box': 'cut',
  underline: 'underline',
  'underline-star': 'underline',
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.join(HERE, 'effects');
const GSAP_MIN_JS = createRequire(import.meta.url).resolve('gsap/dist/gsap.min.js');

/**
 * HyperFrames 컴포지션(프로젝트 폴더)을 어떻게 구성할지 결정한다: index.html, 데이터 스크립트, 자산 파일과 그 이름.
 * 이 클래스 밖에서는 HyperFrames 가 어떤 파일을 기대하는지 몰라도 된다.
 */
@Injectable()
export class CompositionBuilder {
  private template?: string;
  private effectScripts?: string[];

  async build(input: CompositionInput): Promise<Composition> {
    this.template ??= await readFile(path.join(HERE, 'template.html'), 'utf8');
    this.effectScripts ??= await listEffectScripts();

    // 입력은 원본 확장자를 유지한 채 assets/ 로 복사한다 (Chrome 이 확장자를 볼 수 있음)
    const slideName = `slide${extOf(input.inputs.slide, '.png')}`;
    const audioName = `audio${extOf(input.inputs.audio, '.mp3')}`;
    const slideSrc = `./assets/${slideName}`;
    const stage = { width: input.width, height: input.height };
    const warnings: string[] = [];

    const indexHtml = this.template
      .replaceAll('{{W}}', String(input.width))
      .replaceAll('{{H}}', String(input.height))
      .replaceAll('{{FPS}}', String(input.fps))
      .replaceAll('{{DURATION}}', String(input.durationSec))
      .replaceAll('{{SLIDE_SRC}}', slideSrc)
      .replaceAll('{{AUDIO_SRC}}', `./assets/${audioName}`)
      .replaceAll('{{BORDER_PX}}', String(BORDER_PX))
      .replace('{{OBJECT_DIVS}}', () => input.objects.map((o, i) => objectElement(o, i, slideSrc, stage, warnings)).join('\n'))
      .replace('{{EFFECT_SCRIPTS}}', () =>
        this.effectScripts!.map((name) => `    <script src="./assets/effects/${name}"></script>`).join('\n'),
      );

    const slideData = {
      compositionId: 'slide',
      width: input.width,
      height: input.height,
      objects: input.objects,
    };

    const files: CompositionFile[] = [
      { path: 'index.html', content: indexHtml },
      // 인라인 <script> 는 컴파일러가 body 끝으로 옮기므로 데이터는 외부 파일이어야 한다
      { path: 'assets/slide-data.js', content: `window.__SLIDE__ = ${JSON.stringify(slideData)};\n` },
      { path: `assets/${slideName}`, copyFrom: input.inputs.slide },
      { path: `assets/${audioName}`, copyFrom: input.inputs.audio },
      { path: 'assets/gsap.min.js', copyFrom: GSAP_MIN_JS },
      ...this.effectScripts.map((name) => ({ path: `assets/effects/${name}`, copyFrom: path.join(EFFECTS_DIR, name) })),
    ];
    return { files, warnings };
  }
}

/** effects/ 의 스크립트를 로드 순서대로: common.js → 효과 파일들(이름순) → index.js */
async function listEffectScripts(): Promise<string[]> {
  const files = (await readdir(EFFECTS_DIR)).filter((f) => f.endsWith('.js'));
  const effects = files.filter((f) => f !== 'common.js' && f !== 'index.js').sort();
  return ['common.js', ...effects, 'index.js'];
}

/** 객체 하나의 효과 요소. 종류는 ELEMENT_KIND 가 정한다 */
function objectElement(o: PxObject, index: number, slideSrc: string, stage: Size, warnings: string[]): string {
  const color = o.color ?? DEFAULT_HIGHLIGHT_COLOR;
  const timing = `data-start="${o.start}" data-duration="${(o.end - o.start).toFixed(3)}" data-track-index="1"`;
  const kind = ELEMENT_KIND[o.effect];
  if (kind === 'underline') return underlineSvg(o, index, stage, color, timing, warnings);

  const rect = `left:${o.left}px;top:${o.top}px;width:${o.width}px;height:${o.height}px`;
  if (kind === 'box') {
    return `      <div id="${o.domId}" class="clip hl" ${timing} style="${rect};border-color:${color}"></div>`;
  }
  // background-position 을 -left,-top 으로 두면 배경(슬라이드 전체 크기)에서 정확히 그 영역이 보인다
  const cls = o.effect === 'zoom-box' ? 'clip cut ring' : 'clip cut';
  const crop = `background-image:url('${slideSrc}');background-position:-${o.left}px -${o.top}px;--ring:${color}`;
  return `      <div id="${o.domId}" class="${cls}" ${timing} style="${rect};${crop}"></div>`;
}

/**
 * underline / underline-star: 밑줄(.ul-line)과 별(.ul-star) path 를 담은 svg. viewBox 를 요소 위치·크기와 같게 두어 path 는 스테이지 좌표다.
 * path 의 pathLength="100" 은 실제 길이와 무관하게 점선 단위를 0~100 으로 맞춘다 → effects/underline.js 가 dashoffset 100→0 으로 "그린다".
 */
function underlineSvg(o: PxObject, index: number, stage: Size, color: string, timing: string, warnings: string[]): string {
  const { box, line, star, pushed } = layoutUnderline(o, stage, {
    star: o.effect === 'underline-star',
    seed: index,
    stroke: BORDER_PX,
  });
  if (pushed.x !== 0 || pushed.y !== 0) {
    const moved = [
      pushed.x !== 0 && `${Math.abs(pushed.x)}px ${pushed.x < 0 ? 'left' : 'right'}`,
      pushed.y !== 0 && `${Math.abs(pushed.y)}px ${pushed.y < 0 ? 'up' : 'down'}`,
    ].filter(Boolean);
    warnings.push(`object '${o.id}': star pushed ${moved.join(' and ')} to stay inside the slide`);
  }
  const rect = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
  const viewBox = `${box.left} ${box.top} ${box.width} ${box.height}`;
  const paths = [`<path class="ul-line" pathLength="100" d="${line}"/>`];
  if (star) paths.push(`<path class="ul-star" pathLength="100" d="${star}"/>`);
  return `      <svg id="${o.domId}" class="clip ul" ${timing} viewBox="${viewBox}" style="${rect};color:${color}">${paths.join('')}</svg>`;
}

function extOf(file: string, fallback: string): string {
  const ext = path.extname(file).toLowerCase();
  return ext || fallback;
}
