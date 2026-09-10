import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Effect = 'box' | 'zoom' | 'shake' | 'zoom-box';

/** px 로 변환된 객체. effects/index.js 가 window.__SLIDE__.objects 로 받는 형태 */
export interface PxObject {
  id: string;
  /** 효과 요소(div)의 id. box 는 테두리(.hl), 나머지는 오려낸 조각(.cut) */
  domId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  start: number;
  end: number;
  effect: Effect;
  /** 테두리 색. 없으면 DEFAULT_HIGHLIGHT_COLOR */
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

/** 강조 테두리 기본색과 두께. 요청의 color 가 없을 때 쓴다 (설정이 아니라 디자인 값) */
export const DEFAULT_HIGHLIGHT_COLOR = '#FF3B30';
export const BORDER_PX = 6;

/**
 * 효과별로 어떤 요소를 만들지. 새 효과를 추가할 때 여기에 한 줄, effects/<이름>.js 에 함수 하나, DTO 의 EFFECTS 에 이름 하나.
 * - box: 객체 위치에 테두리 div (.hl)
 * - cut: 슬라이드 이미지를 배경으로 깔고 객체 영역만 보이게 자른 조각 div (.cut). 조각만 transform 되므로 배경은 그대로
 */
const ELEMENT_KIND: Record<Effect, 'box' | 'cut'> = {
  box: 'box',
  zoom: 'cut',
  shake: 'cut',
  'zoom-box': 'cut',
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

  async build(input: CompositionInput): Promise<CompositionFile[]> {
    this.template ??= await readFile(path.join(HERE, 'template.html'), 'utf8');
    this.effectScripts ??= await listEffectScripts();

    // 입력은 원본 확장자를 유지한 채 assets/ 로 복사한다 (Chrome 이 확장자를 볼 수 있음)
    const slideName = `slide${extOf(input.inputs.slide, '.png')}`;
    const audioName = `audio${extOf(input.inputs.audio, '.mp3')}`;
    const slideSrc = `./assets/${slideName}`;

    const indexHtml = this.template
      .replaceAll('{{W}}', String(input.width))
      .replaceAll('{{H}}', String(input.height))
      .replaceAll('{{FPS}}', String(input.fps))
      .replaceAll('{{DURATION}}', String(input.durationSec))
      .replaceAll('{{SLIDE_SRC}}', slideSrc)
      .replaceAll('{{AUDIO_SRC}}', `./assets/${audioName}`)
      .replaceAll('{{BORDER_PX}}', String(BORDER_PX))
      .replace('{{OBJECT_DIVS}}', () => input.objects.map((o) => objectDiv(o, slideSrc)).join('\n'))
      .replace('{{EFFECT_SCRIPTS}}', () =>
        this.effectScripts!.map((name) => `    <script src="./assets/effects/${name}"></script>`).join('\n'),
      );

    const slideData = {
      compositionId: 'slide',
      width: input.width,
      height: input.height,
      objects: input.objects,
    };

    return [
      { path: 'index.html', content: indexHtml },
      // 인라인 <script> 는 컴파일러가 body 끝으로 옮기므로 데이터는 외부 파일이어야 한다
      { path: 'assets/slide-data.js', content: `window.__SLIDE__ = ${JSON.stringify(slideData)};\n` },
      { path: `assets/${slideName}`, copyFrom: input.inputs.slide },
      { path: `assets/${audioName}`, copyFrom: input.inputs.audio },
      { path: 'assets/gsap.min.js', copyFrom: GSAP_MIN_JS },
      ...this.effectScripts.map((name) => ({ path: `assets/effects/${name}`, copyFrom: path.join(EFFECTS_DIR, name) })),
    ];
  }
}

/** effects/ 의 스크립트를 로드 순서대로: common.js → 효과 파일들(이름순) → index.js */
async function listEffectScripts(): Promise<string[]> {
  const files = (await readdir(EFFECTS_DIR)).filter((f) => f.endsWith('.js'));
  const effects = files.filter((f) => f !== 'common.js' && f !== 'index.js').sort();
  return ['common.js', ...effects, 'index.js'];
}

function objectDiv(o: PxObject, slideSrc: string): string {
  const color = o.color ?? DEFAULT_HIGHLIGHT_COLOR;
  const timing = `data-start="${o.start}" data-duration="${(o.end - o.start).toFixed(3)}" data-track-index="1"`;
  const rect = `left:${o.left}px;top:${o.top}px;width:${o.width}px;height:${o.height}px`;
  if (ELEMENT_KIND[o.effect] === 'box') {
    return `      <div id="${o.domId}" class="clip hl" ${timing} style="${rect};border-color:${color}"></div>`;
  }
  // background-position 을 -left,-top 으로 두면 배경(슬라이드 전체 크기)에서 정확히 그 영역이 보인다
  const cls = o.effect === 'zoom-box' ? 'clip cut ring' : 'clip cut';
  const crop = `background-image:url('${slideSrc}');background-position:-${o.left}px -${o.top}px;--ring:${color}`;
  return `      <div id="${o.domId}" class="${cls}" ${timing} style="${rect};${crop}"></div>`;
}

function extOf(file: string, fallback: string): string {
  const ext = path.extname(file).toLowerCase();
  return ext || fallback;
}
