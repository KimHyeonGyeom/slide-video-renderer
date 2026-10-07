# 슬라이드 강조 영상 렌더 서비스 — 설계 v3 (최종)

v2 → v3 변경

- **쿠버네티스(내부망) 배포 전제.** 파드당 렌더 1개는 코드 상수, 처리량은 replica 수로 조절
- **요청은 전부 접수.** 대기열 상한과 503 제거. 파드 안 대기열에서 순서대로 처리
- `RENDER_CONCURRENCY` env 제거 → env는 `PORT`, `NODE_ENV` 두 개
- 렌더 타임아웃은 **렌더 시작 시점**부터 계산. 대기 중 연결이 끊긴 요청은 건너뜀
- `docker:run` 제거(이미지는 CI가 빌드), **§12 운영팀 전달 사항** 추가

v3 → v3.1 (2026-09-10 스모크 테스트 반영)

- 렌더 1회 성공, 효과 4종 프레임 확인. **10.4초 영상 → 렌더 9~10초** (M시리즈 Mac, §14)
- 컴파일러가 body 인라인 `<script>` 를 body 끝으로 옮김 → 데이터는 외부 파일 `slide-data.js` 로 (§6)
- 타임라인 미등록이면 엔진이 45초 기다린 뒤 **애니메이션 없이 성공으로 렌더** → `job.warnings` 검사해 실패 처리 (§7)
- 캡처 워커 auto 는 호스트 코어 수 기준 → `RENDER_WORKERS`(기본 2)로 직접 넘김 (§10, §12)
- 측정: 워커 2개 피크 메모리 1.1GB, 6개 2.4GB → 파드 CPU 2 / 메모리 2Gi (§12)

v3.1 → v3.2 (2026-09-10 Nest 뼈대 + 효과 재정의)

- **효과 재정의.** `zoom` = 객체 영역을 오려낸 조각이 제자리에서 서서히 커짐(카메라 줌 아님), `pulse` → **`shake`** = 오려낸 조각을 살짝 띄워 흔듦. 줌 겹침 금지 검증 제거 (§4, §6)
- Nest 뼈대 완료. 400 3종·정상 렌더·동시 3건·대기 중 연결 끊김·SIGTERM 검증 통과 (`scripts/api-test.sh`, §14)
- **ESM** 으로 빌드. `@hyperframes/producer` 가 `import` 조건만 export 해 CommonJS 로 불러올 수 없다. `p-limit` 대신 자체 `Semaphore` (§3, §7)

v3.2 → v3.3 (2026-09-10 구조 리팩터링)

- 설정: `constants` 전역 import → env + `registerAs` 설정 주입 (§10)
- 예외: 서비스 안 `toHttpError` → **`ErrorCode` 표 + `AppException` + `GlobalExceptionFilter`**. 에러 응답 형태 통일 (§4, §7)
- 로거: `new Logger()` → **nestjs-pino** 주입. JSON 로그, `reqId`/`jobId` 자동, producer 로그 브리지 (§7)
- render 분해: workspace(파일시스템) / queue(동시성) / mapper(변환·검증) / service(흐름). 자산 이름은 `CompositionBuilder` 가 결정
- 헬스 terminus, Vitest 단위·e2e 14개, ESLint/Prettier, `.nvmrc`, `.env.example`, 픽스처 gitignore, README

v3.3 → v3.4 (2026-09-10 Docker 벤치)

- Dockerfile·entrypoint 완성, CPU/메모리 제한 컨테이너 벤치로 파드 크기 근거 확보 (§12, §14)
- 발견: producer 가 `esbuild` 를 미선언 import → prod dependency 로 추가 (§7). 벤치 클라이언트의 Node fetch 5분 타임아웃 → 호출 측 클라이언트 주의 항목 (§12)

v3.4 → v3.5 (2026-09-10 설정 정리)

- Joi 스키마·설정 서비스 제거 → `config/configuration.ts` 하나(`registerAs`)와 `.env`(로컬, 커밋 안 함) + `.env.example`. 이유: 현업에서 보는 모양이 아니라는 피드백 (§10)
- 워커 수를 `RENDER_WORKERS` 로 받아 `createRenderJob({ workers })` 에 직접 전달 (CLI `--workers` 와 동일). producer 로거도 `logger` 옵션으로 정식 전달, defaultLogger 바꿔치기 제거 (§7)

v3.5 → v3.6 (2026-09-14)

- 설정 레이어 제거: `config/configuration.ts` 와 `@nestjs/config` 를 빼고 각 파일이 `process.env` 를 직접 읽는다. `.env` 는 `dotenv/config` 가 로드 (§10)
- SIGTERM 실제 동작 정정: 렌더 중이면 그 요청이 500. k8s `preStop` 으로 큐를 비우는 것이 대책 (§9, §12)

v3.6 → v3.7 (2026-10-02 marker 효과)

- **`marker` 효과 추가.** 형광펜: 상자 위에 굵은 SVG 획을 왼쪽에서 오른쪽으로 긋는다. 가장자리는 노이즈 변위로 울퉁불퉁, `multiply` 라 글자가 가려지지 않는다. 넓고 높은 상자는 여러 줄 텍스트로 보고 줄마다 왼쪽에서 오른쪽으로 (§4, §6)
- 요소 종류 셋째 `marker`: 빌더는 빈 컨테이너 div 만 만들고 획은 `effects/marker.js` 가 브라우저에서 그린다. 모양 난수는 domId 로 시드를 고정해 캡처 워커가 여러 개여도 같은 프레임 (§6)

v3.7 → v3.8 (2026-10-06 효과 4종 추가)

- **`circle` `underline` `glow` `spotlight` 추가.** 펜 동그라미·손글씨 밑줄은 marker 의 펜 코드를 재사용, glow 는 숨 쉬는 빛 테두리, spotlight 는 대상만 남기고 화면을 어둡게 (§4, §6)
- 요소 종류 `marker` → **`fx`** 로 일반화: 빈 컨테이너 div(.fx.<효과>)에 효과 스크립트가 그려 넣고 색은 `--color` 로 받는다. 펜·곡선·시드 난수 헬퍼는 `common.js` 로 이동 (§6)
- 픽스처를 도형 4개·효과 8개·14초로 확장 (§13)

## 1. 한 줄 요약

`POST /render` 로 **슬라이드 이미지 + 음성(mp3) + 객체 목록(EMU 좌표, start/end, effect)** 을 받아
HyperFrames HTML 컴포지션을 만들고 `@hyperframes/producer` 로 **음성 길이만큼의 mp4** 를 렌더한 뒤
요청의 `outputPath` 에 저장하고 **동기 응답**한다. 요청은 몇 개가 오든 전부 접수하고, 파드 하나는 렌더를 **한 번에 하나씩** 처리한다.

## 2. 고정값과 가정

| 항목 | 값 | 비고 |
|---|---|---|
| 출력 | 1920×1080, 30fps, mp4(H.264) | 코드 상수 |
| 슬라이드 크기 | 16:9 표준 = 12,192,000 × 6,858,000 EMU | 1920×1080 과 비율이 같아 **`EMU_PER_PX = 6350`** 하나로 변환 (12192000/1920 = 6858000/1080) |
| 슬라이드 이미지 | 1920×1080 PNG/JPG | 다른 해상도가 와도 stage 에 맞춰 늘리므로 깨지진 않지만, 비율이 16:9가 아니면 좌표가 어긋남 |
| 입력 위치 | 값이 `http(s)://` 로 시작하면 다운로드, 아니면 로컬 경로 복사 | 운영: NAS URL / 로컬: 픽스처 경로. 별도 모드 스위치 없음 |
| 결과 | 요청의 `outputPath` 에 mp4 저장 | 파드에 마운트된 NAS 경로 |
| 네트워크 | HTTP, 인증 없음 | 내부망 전용. 외부 노출 시 앞단에서 HTTPS 종료 + 인증 |
| 배포 | 쿠버네티스, 운영팀이 세팅 | 파드당 렌더 1개. 더 필요하면 replica |

**주의**: PPT 원본이 16:9 표준(13.333 × 7.5 in)이 아니면 `EMU_PER_PX` 가 달라진다. 4:3(9,144,000 EMU 폭) 덱이 섞여 있으면 알려달라.

## 3. 기술 스택

| 역할 | 선택 | 비고 |
|---|---|---|
| 런타임 | **Node 22** | hyperframes `engines >= 22`. 현재 Mac은 20.19 → `nvm install 22` |
| 프레임워크 | **NestJS 12** (platform-express) | `@nestjs/config`, `@nestjs/swagger`(CLI 플러그인) |
| 모듈 | **ESM** (`"type": "module"`, tsconfig `NodeNext`) | producer 가 ESM 전용. 상대 import 는 `.js` 확장자 필수 |
| 검증 | class-validator + class-transformer | `ValidationPipe({ whitelist: true, transform: true })` |
| 설정 | `process.env` + `dotenv` | 각 파일이 직접 읽음. 설정 레이어 없음 |
| 예외 | `ErrorCode` + `AppException` + `GlobalExceptionFilter` | Spring 의 ErrorCode enum + BusinessException + ControllerAdvice |
| 로거 | `nestjs-pino` | 운영 JSON, 로컬 pino-pretty. `reqId`/`jobId` 자동 |
| 헬스 | `@nestjs/terminus` | `/health` (Actuator 대응) |
| 테스트/린트 | Vitest + SWC + supertest, ESLint + Prettier | Nest 공식 SWC 레시피 |
| 렌더 | `@hyperframes/producer` (in-process) | `createRenderJob` + `executeRenderJob` |
| CLI(dev) | `hyperframes` | `doctor`, `browser ensure`, `preview` |
| 애니메이션 | GSAP (npm) | `gsap.min.js` 를 작업 폴더로 복사 → CDN 의존 없음 |
| 직렬화 | `Semaphore(1)` — `common/semaphore.util.ts` | 파드당 렌더 1개를 지키는 유일한 코드 (§9). p-limit 은 ESM/CJS 문제로 자체 구현 |
| 미디어 | ffmpeg / ffprobe (PATH) | 로컬 brew(8.1 있음), 이미지 apt |
| 픽스처 | sharp (dev) | 테스트용 슬라이드 PNG 합성 |

## 4. API

Swagger UI: `GET /docs` (`@nestjs/swagger` CLI 플러그인으로 DTO 에서 자동 생성 → 호출 측에 이 주소만 주면 됨)

### `POST /render`

```jsonc
{
  "slideId": "deck01-s03",                             // 선택. 로그/응답 식별용
  "slideImage": "https://nas.example/deck01/s03.png",  // URL 또는 절대경로
  "audio":      "https://nas.example/deck01/s03.mp3",
  "outputPath": "/mnt/nas/deck01/s03.mp4",             // 결과 mp4 절대경로. 파드 기준
  "objects": [
    { "id": "title",                                   // 선택. 없으면 "obj-<index>"
      "left": 838200, "top": 365125, "width": 10515600, "height": 1325563,   // EMU
      "start": 0.5, "end": 3.0,                        // 초
      "effect": "box",                                 // box | zoom | shake | zoom-box | marker | circle | underline | glow | spotlight
      "color": "#FF3B30" }                             // 선택. box/zoom-box 테두리, marker 형광펜, circle/underline 펜, glow 빛 색
  ]
}
```

검증 — DTO(class-validator, 필드 단위):

- `left, top >= 0`, `width, height >= 1` 정수. `start >= 0`, `end > 0`. `objects` 1개 이상
- `effect` ∈ {box, zoom, shake, zoom-box, marker, circle, underline, glow, spotlight}. `color` 는 `#RRGGBB`
- `outputPath` 는 절대경로이고 `.mp4` 로 끝남

검증 — 서비스(필드 간 규칙, Spring 에서 서비스 계층에 두는 것과 같음):

- `start < end`, `end - start >= 0.3`
- `end > 음성 길이` → 음성 길이로 **클램프** + `warnings` (호출 시점에 음성 길이를 정확히 모를 수 있으므로 거절하지 않음)
- `color` 가 `zoom` / `shake` / `spotlight` 에 오면 무시

응답:

```jsonc
// 200
{ "slideId": "deck01-s03", "outputPath": "/mnt/nas/deck01/s03.mp4",
  "durationSec": 8.12, "queuedMs": 61200, "renderMs": 23410,
  "warnings": ["object 'chart': end 8.5 clamped to audio length 8.12"] }

// 에러는 전부 같은 형태 (GlobalExceptionFilter). error 는 common/exceptions/error-code.ts 의 코드
// 400 { "statusCode": 400, "error": "VALIDATION_FAILED", "message": ["..."] }
// 400 { "statusCode": 400, "error": "INPUT_NOT_READABLE" | "INVALID_HIGHLIGHT", "message": "...", "jobId": "...", "details"?: [...] }
// 504 { "statusCode": 504, "error": "RENDER_TIMEOUT", "jobId": "..." }              ← 렌더 시작 후 RENDER_TIMEOUT_MS 초과
// 500 { "statusCode": 500, "error": "RENDER_FAILED" | "COMPOSITION_NOT_ANIMATED", "message": "...", "jobId": "..." }
```

`queuedMs` 는 대기열에서 기다린 시간. 호출 측이 파드 수를 늘려야 할지 판단하는 근거가 된다.

### `GET /health` → terminus 형식 `{ status: "ok", info: { renderQueue: { status: "up", rendering, queued } } }` — liveness / readiness 프로브 겸용

## 5. 좌표: `left/top/width/height` (EMU)

- python-pptx 의 `shape.left, top, width, height` 와 이름이 같아 호출 측이 그대로 넣으면 된다.
- `px = Math.round(emu / 6350)`.
- 회전, 그룹 도형 내부 상대 좌표는 1차 범위 밖.

## 6. HyperFrames 컴포지션

요청마다 `work/<jobId>/index.html` 을 생성한다 (실제 소스: `src/hyperframes/template.html`, `effects/`, `composition.builder.ts`). 루트 `data-duration` 이 곧 렌더 길이 → **ffprobe 로 잰 음성 길이**를 넣는다.

```html
<div id="stage" data-composition-id="slide" data-start="0"
     data-duration="{{DURATION}}" data-width="1920" data-height="1080" data-fps="30">
  <img id="bg" class="clip" src="./assets/slide.png" data-start="0" data-duration="{{DURATION}}">

  <!-- box: 테두리 div -->
  <div id="hl-0" class="clip hl" data-start="0.5" data-duration="2.5"
       style="left:132px;top:58px;width:1656px;height:209px;border-color:#FF3B30"></div>
  <!-- zoom / shake / zoom-box: 슬라이드 이미지를 배경으로 깔고 객체 영역만 보이게 자른 "조각" div -->
  <div id="hl-1" class="clip cut ring" data-start="3.5" data-duration="3"
       style="left:240px;top:360px;width:720px;height:480px;
              background-image:url('./assets/slide.png');background-position:-240px -360px;--ring:#FF3B30"></div>
  <!-- marker · circle · underline · glow · spotlight: 빈 컨테이너 div (.fx). 효과 스크립트가 로드 시점에 SVG/그림자를 그려 넣는다. 색은 --color -->
  <div id="hl-2" class="clip fx marker" data-start="4" data-duration="3.5"
       style="left:132px;top:890px;width:1656px;height:186px;--color:#FFE23A"></div>

  <audio src="./assets/audio.mp3" data-start="0" data-duration="{{DURATION}}" data-volume="1"></audio>
  <script src="./assets/slide-data.js"></script>   <!-- window.__SLIDE__ = {...}. 외부 파일이어야 한다 (아래) -->
  <script src="./assets/gsap.min.js"></script>
  <script src="./assets/effects/common.js"></script>  <!-- 공통 헬퍼 → 효과 파일들(이름순) → index.js 순서. 빌더가 채운다 -->
  <script src="./assets/effects/index.js"></script>   <!-- 타임라인 생성 + window.__timelines.slide 등록 -->
</div>
```

`.cut` 은 `background-size: 1920px 1080px` 에 `background-position: -left -top` 이라 정확히 그 영역의 픽셀만 보인다. 1배에서는 원본과 같은 그림이라 등장할 때 그림자만 스며들고, transform 은 이 조각에만 걸리므로 **배경 슬라이드는 움직이지 않는다.**

`effects/` (브라우저에서 실행되는 정적 파일. `common.js` 공통 헬퍼 → 효과별 파일 → `index.js` 진입점 순서로 로드):

| effect | 동작 |
|---|---|
| `box` | 테두리 opacity 0→1 (0.25s, `start`) … 1→0 (0.25s, `end−0.25`) |
| `zoom` | 조각이 제자리에서 **1.18배까지 서서히 커진다** (구간의 절반, 0.4~1.5s). 끝 0.5s 에 원래 크기로 되돌아오며 그 동안 0.4s 에 걸쳐 사라진다. 커진 뒤 화면 밖으로 나가면 배율을 줄이고 안쪽으로 밀어 넣는다 |
| `shake` | 조각이 1.05배로 살짝 뜬 뒤 **좌우 ±8px + 기울임 ±1.2° 로 0.6s 흔들고 0.5s 쉬기**를 구간 끝까지 반복 |
| `zoom-box` | zoom + 조각에 테두리 링 (`box-shadow` 라 크기에 영향 없음, 색은 `--ring`) |
| `marker` | 상자 위에 **형광펜 획을 왼쪽에서 오른쪽으로 긋는다** (한 획 0.5s, 여러 획은 0.42s + 0.26s×획 수, 구간의 45% 이내). 넓고 높은 상자(높이 ≥ 줄 높이 62px × 1.5, 너비/높이 ≥ 2.4)는 여러 줄 텍스트로 보고 줄마다 따로, 모두 왼쪽에서 오른쪽으로. 끝 0.3s 페이드. 가장자리는 노이즈 변위, 알파에 가로 노이즈를 곱한 마른 자국, `multiply` 라 글자가 가려지지 않는다. 모양 난수는 domId 로 시드 고정 |
| `circle` | 펜으로 상자 둘레를 **한 바퀴 조금 넘게**(1.12바퀴) 둘러 그린다 (0.7s, 구간의 40% 이내). 두 바퀴째는 4% 바깥으로 벗어나고 반지름이 3% 흔들린다. 끝 0.3s 페이드. marker 와 같은 펜 헬퍼(시드 난수·거친 가장자리·긋기) |
| `underline` | 상자 아래쪽(높이의 90% 지점)에 **손글씨 밑줄** 한 줄을 왼쪽에서 오른쪽으로 (0.45s, 구간의 35% 이내). 굵기는 높이의 7% (4~9px). 끝 0.3s 페이드 |
| `glow` | 상자보다 10px 큰 둥근 빛 테두리가 0.3s 에 나타나 **1.03배로 숨 쉬듯** 0.45s 주기로 커졌다 작아지기를 반복하고 끝 0.3s 페이드 |
| `spotlight` | 상자보다 14px 큰 구멍만 남기고 **화면 전체를 55% 어둡게**. 조리개처럼 1.06배에서 조여들며 0.4s 에 나타나고 끝 0.35s 에 걷힌다. 같은 시간에 두 객체에 걸면 서로를 어둡게 하므로 겹치지 말 것 |

조각(.cut)에는 떠 있는 느낌의 그림자(`0 10px 30px rgba(0,0,0,.35)`)가 있다. 객체끼리 시간이 겹쳐도 된다 (효과가 객체별로 독립). 튜닝 상수(페이드, 배율, 진폭, 리듬)는 각 효과 파일 상단에 있다.

**새 효과 추가**: ① DTO `EFFECTS` 에 이름 ② `composition.builder.ts` `ELEMENT_KIND` 에 요소 종류(box | cut | fx) ③ `effects/<이름>.js` 에 `window.HL.effects.<이름> = function (tl, o, ctx) {...}`. 빌더가 폴더를 읽어 script 태그와 복사 목록을 만들므로 다른 곳은 손대지 않는다.

HyperFrames 규칙: `paused:true` 타임라인 하나를 `window.__timelines.slide` 에 동기 등록, `play()/currentTime` 직접 호출 금지, wall-clock/`setTimeout`/무한 반복 금지.

스모크 테스트에서 확인한 엔진 동작:

- **컴파일러가 body 의 인라인 `<script>` 를 전부 떼어 body 끝에 다시 붙인다.** 외부 `<script src>` 는 순서가 유지된다. 그래서 데이터를 인라인으로 넣으면 효과 스크립트보다 늦게 실행돼 효과가 전부 빠진 영상이 나온다. 데이터는 `assets/slide-data.js` 외부 파일로 쓴다.
- 타임라인이 등록되지 않으면 엔진은 워커마다 45초(`PRODUCER_PLAYER_READY_TIMEOUT_MS`)를 기다린 뒤 **경고만 남기고 애니메이션 없이 성공으로 렌더**한다. `effects/index.js` 는 `window.__SLIDE__` 가 없으면 `console.error` 를 남기고, 서비스는 `job.warnings` 를 검사해 실패 처리한다(§7).
- `.cut` 의 background-image 조각 방식은 컴파일러·캡처에 문제 없다. 4종 효과 모두 프레임에서 확인됨.
- `.fx` 효과(marker·circle·underline·glow·spotlight)는 SVG·그림자를 마크업에 넣지 않고 효과 스크립트가 DOM API 로 그려 넣는다 (컴파일러가 SVG 태그·camelCase 속성을 어떻게 다루는지에 기대지 않기 위해). 워커 2개 렌더에서 세 획·거친 가장자리·마른 자국 프레임 확인 (2026-10-02). `multiply` 는 어두운 슬라이드에서 거의 보이지 않으므로(글자만 노랗게 물든다) 다크 테마 슬라이드는 아직 지원 범위 밖. circle·underline·glow·spotlight 도 워커 2개 렌더에서 프레임 확인 (2026-10-06). spotlight 는 어두운 슬라이드에서도 통한다.

## 7. `src/` 구조 (NestJS)

```
src/
├─ main.ts                        # bootstrap: pino 로거 교체, ValidationPipe, Swagger(/docs), 서버 타임아웃 해제, enableShutdownHooks
├─ app.module.ts                  # AppConfigModule + LoggerModule(pino) + HealthModule + RenderModule, APP_FILTER = GlobalExceptionFilter
├─ common/
│  ├─ exceptions/error-code.ts    # 에러 코드 표: code → status, 기본 메시지
│  ├─ exceptions/app.exception.ts # AppException(code, { message?, jobId?, details?, cause? }) — 서비스가 던지는 유일한 예외
│  ├─ filters/global-exception.filter.ts   # 예외 → HTTP 응답 { statusCode, error, message, jobId?, details? } + 로그
│  ├─ dto/error-response.dto.ts   # 위 응답 형태 (Swagger)
│  └─ utils/                      # emu, ffprobe, download, semaphore (순수 함수, 단위 테스트)
├─ health/                        # @nestjs/terminus. /health 에 renderQueue { rendering, queued }
├─ render/
│  ├─ render.module.ts
│  ├─ render.controller.ts        # HTTP 만. 응답 전에 연결이 끊기면 AbortSignal
│  ├─ render.service.ts           # 요청 1건의 흐름(§8)만. 단계마다 담당 클래스 호출
│  ├─ render-workspace.service.ts # 파일시스템 전부: work/<jobId> 생성, 입력 확보(URL/로컬), 컴포지션 파일 쓰기, 결과 이동, 정리
│  ├─ render-queue.service.ts     # Semaphore(RENDERS_PER_POD) + 상태. health 가 읽는다
│  ├─ slide-objects.mapper.ts     # DTO(EMU, 초) → px 객체 + 필드 간 검증. 순수 함수
│  └─ dto/                        # RenderRequestDto(class-validator), RenderResponseDto
└─ hyperframes/                   # HyperFrames 를 아는 유일한 곳
   ├─ hyperframes.module.ts
   ├─ hyperframes.service.ts      # @hyperframes/producer 호출, 경고 검사, producer 로그를 pino 로 브리지
   ├─ composition.builder.ts      # 프로젝트 폴더 구성을 결정: index.html, slide-data.js, 자산 이름(원본 확장자 유지)
   ├─ template.html               # nest-cli.json assets 로 dist 에 복사
   └─ effects/                    # common.js(공통 헬퍼) · box.js · zoom.js(zoom, zoom-box) · shake.js · marker.js · circle.js · underline.js · glow.js · spotlight.js · index.js(진입)
test/app.e2e-spec.ts              # supertest: /health, 400 두 종류. 실제 렌더는 scripts/api-test.sh
```

원칙:

- **계층을 섞지 않는다.** 서비스는 `AppException` 만 던지고 HTTP 상태·응답 본문·에러 로그는 필터 한 곳이 만든다. 서비스는 상수를 import 하지 않고 설정 주입 를 주입받는다.
- **한 클래스가 한 관심사.** 파일시스템(workspace), 동시성(queue), 변환·검증(mapper), 엔진 호출(hyperframes), 흐름(service).
- **Nest 관례 우선.** `config/`, `dto/`, 모듈 파일, `.controller/.service` 접미사. 유지보수자가 Nest 문서와 같은 그림을 본다.

Spring 대응표와 "걸려 넘어질 지점"은 README 에 있다.

결정 기록:

- **NestJS 채택.** 개발자는 빠지고 Spring 에 익숙한 사람들이 유지보수한다. Nest 는 Spring Boot 의 계층·용어와 거의 1:1 이고, 순수 Express 는 Spring 사람 눈에 구조 없는 스크립트로 보인다.
- **예외는 코드 표 + 클래스 하나.** 예외 클래스를 종류별로 나누면(6개) 엔드포인트 하나에 과하다. `ErrorCode` + `AppException` + 전역 필터가 Spring 의 `ErrorCode` enum + `BusinessException` + `@RestControllerAdvice` 와 같은 그림이다.
- **설정 레이어 없음.** Joi 스키마 → `registerAs` 설정 모듈 → 최종적으로 각 파일에서 `process.env` 직접 읽기로 정리했다. 엔드포인트 하나짜리 서비스에서 설정 추상화가 값을 못 한다는 판단. 키가 어디서 쓰이는지는 §10 표와 `.env.example` 이 보여준다. 예외는 디자인 값(테두리 색·두께)과 브라우저에서 도는 `effects/*.js` 상수.
- **로거는 nestjs-pino.** 운영은 JSON 한 줄, 요청마다 `reqId`, 렌더마다 `jobId`/`slideId` 자동 바인딩. producer 의 자체 콘솔 로거는 메서드를 바꿔 pino 로 흘린다(info→debug). 엔진이 `console.log` 로 직접 찍는 줄은 남는다.
- **ESM.** `@hyperframes/producer` 는 `exports` 에 `import` 조건만 있어 `require()` 가 실패한다. 프로젝트 전체를 ESM 으로 빌드하고(`NodeNext`), 상대 import 에 `.js` 를 붙인다. `p-limit` 도 같은 이유로 자체 `Semaphore`.
- **빌드는 Nest CLI, 테스트는 Vitest + SWC.** DI 가 `emitDecoratorMetadata` 에 의존한다. `consistent-type-imports` 린트 규칙은 켜지 않는다(생성자 파라미터 타입을 `import type` 으로 바꾸면 DI 가 깨진다).
- **`esbuild` 를 prod dependency 로 직접 선언.** `@hyperframes/producer` 가 런타임에 `esbuild` 를 import 하는데 자기 의존성에는 없다(호이스팅에 기댄 패키징 버그). 로컬은 우연히 돌지만 `npm prune --omit=dev` 한 컨테이너에서는 `ERR_MODULE_NOT_FOUND` 로 기동 실패. 그래서 `esbuild@^0.25`(core 가 요구하는 버전)를 우리 dependencies 에 넣었고, Vitest 는 esbuild 0.28 을 자기 밑에 중첩할 수 있는 vite 7 조합(vitest 4)으로 맞췄다. hyperframes 를 올릴 때 이 조합을 다시 확인할 것.

## 8. 파이프라인 (`render.service.ts`)

```
render(dto, req)
 1. jobId 발급, work/<jobId>/assets 생성. signal = AbortController (req 'close' 시 abort)
 2. 입력 확보
      http(s) → downloadToFile (DOWNLOAD_TIMEOUT_MS, MAX_DOWNLOAD_MB)
      그 외   → copyFile
      확장자는 원본 유지 (slide.png / slide.jpg, audio.mp3)
 3. audioDurationSec → end 클램프(+warning), start<end·줌 겹침 검사(400)
 4. CompositionBuilder 가 정한 파일 계획을 Workspace.materialize 가 쓴다 (index.html, slide-data.js, 입력 복사, gsap, effects/*.js)
 5. limit(async () => {                                   ← 파드당 1개. 앞 렌더가 끝나야 들어옴
      if (signal.aborted) return;                         ← 기다리다 연결이 끊긴 요청은 건너뜀
      RENDER_TIMEOUT_MS 타이머 시작 (대기 시간은 포함하지 않음)
      await hyperframes.renderMp4(workDir, workDir/<outputPath 의 파일명>, signal)
    })
 6. 렌더 결과(work/<jobId>/<outputPath 의 파일명>) → dto.outputPath  (mkdir -p 후 rename, 실패하면 copy+unlink: work 와 NAS 마운트가 다른 볼륨). outputPath 에 직접 쓰지 않는 이유: NAS 에 쓰다 만 파일이 보이거나 실패한 파일이 남지 않게
 7. finally: work/<jobId> 삭제. 렌더 실패(5xx, 클라이언트 이탈 제외) + NODE_ENV != production 이면 보존(디버깅)
```

2~4단계는 슬롯 밖에서 수행한다. 20개가 동시에 오면 다운로드 20개는 동시에 진행되고 렌더만 줄을 선다.

## 9. 동시 처리와 직렬화

**Node 는 요청 1개당 스레드 1개가 아니다.** 이벤트 루프 하나가 모든 연결을 동시에 들고 있다가 I/O 를 기다리는 동안 다른 요청을 처리한다. 그래서 10~20개가 한꺼번에 와도 전부 접수되고 다운로드까지 동시에 간다. 막히는 건 JS 가 CPU 를 오래 쓸 때뿐인데, 이 서비스의 무거운 일은 hyperframes 가 띄우는 Chrome 프로세스(프레임 캡처)와 ffmpeg 프로세스(인코딩)라 Node 스레드는 지휘만 한다. 병목은 Node 가 아니라 **파드의 CPU** 다.

**왜 `Semaphore(1)` 인가.** 제한이 없으면 20개 요청이 `executeRenderJob` 을 20번 동시에 부르고, 파드 하나에 Chrome 20개 + ffmpeg 20개가 뜬다. 메모리 limit 을 넘겨 파드가 죽거나(진행 중 20개 전부 실패), 코어 2개를 20개가 나눠 써서 순서대로 도는 것보다 늦게 끝난다. `Semaphore(1)` 은 렌더 호출만 한 번에 하나 통과시키고 나머지는 프로미스로 기다리게 한다. 기다리는 요청은 메모리를 거의 안 쓴다. 쿠버네티스는 파드 수와 리소스 상한만 정할 수 있고 파드 안의 동시 실행 수는 정할 수 없으므로, "파드당 렌더 1개" 약속을 지키는 코드는 이것뿐이다. 렌더가 파드 안에서 동시에 둘 이상 돌지 않으므로 producer 의 in-process 동시 호출 간섭 문제도 생기지 않는다.

**대기열은 상한 없음.** 요청은 전부 접수하고 순서대로 처리한다. 마지막 요청의 완료 시간은 대략 `ceil(요청 수 / 파드 수) × 렌더 1건 시간`. 렌더 1건 ≈ 영상 길이(측정: 10.4초 영상 → 9~10초, §14). 슬라이드 1장 음성이 30초라면 렌더도 약 30초로 보고:

| 파드 수 | 20개 완료까지 |
|---|---|
| 1 | 약 10분 |
| 2 | 약 5분 |
| 4 | 약 2.5분 |

Service 는 어느 파드가 바쁜지 모르고 무작위로 뿌리므로 파드 간 분배가 고르지 않을 수 있다. 물량이 적으면 무시해도 되고, 호출 측이 슬라이드를 순차로 보내면 문제 자체가 없다.

**타임아웃.** `RENDER_TIMEOUT_MS` 는 렌더가 실제로 시작된 뒤부터 잰다. 대기 시간에는 상한을 두지 않으며, 실제 상한은 호출 측과 앞단(Ingress)의 타임아웃이다(§12). 기다리는 동안 호출 측이 연결을 끊으면 그 요청은 슬롯을 받았을 때 건너뛴다.

**종료(SIGTERM).** 실측으로 확인한 동작 (2026-09-10):

- 렌더 중이 아닐 때: Nest 종료 훅이 돌고 깨끗하게 종료된다.
- **렌더 중일 때: 그 요청이 500 `RENDER_FAILED` 로 실패한다.** puppeteer 의 기본값 `handleSIGTERM: true` 가 Chrome 을 즉시 닫아 캡처가 "detached Frame" 으로 깨진다. 브라우저를 띄우는 곳이 `@hyperframes/engine` 이라 우리 코드에서 이 옵션을 끌 수 없다.
- 대책은 **SIGTERM 이 오기 전에 큐를 비우는 것**: 쿠버네티스 `preStop` 훅에서 `/health` 의 `rendering`·`queued` 가 0 이 될 때까지 기다린다. k8s 는 preStop 이 끝난 뒤 SIGTERM 을 보내므로 진행 중 렌더가 보존된다 (§12). preStop 없이 배포하면 진행 중이던 요청 1건이 500 을 받는다.

## 10. 설정

값은 env 로 준다. 로컬은 `.env`(커밋 안 함, `.env.example` 복사), 운영은 Deployment env. **설정 레이어는 두지 않는다** — 각 파일 맨 위에서 `process.env` 를 직접 읽고 없으면 기본값을 쓴다. `.env` 로딩은 `main.ts` 첫 줄의 `import 'dotenv/config'` 가 맡고, 이미 있는 환경변수가 `.env` 보다 우선한다.

| 키 (기본값) | 읽는 곳 |
|---|---|
| `PORT`(8080) | `main.ts` |
| `NODE_ENV`(development) `LOG_LEVEL`(info) | `app.module.ts` |
| `RENDER_WIDTH`(1920) `RENDER_HEIGHT`(1080) `RENDER_FPS`(30) `RENDER_TIMEOUT_MS`(600000) `SLIDE_WIDTH_EMU`(12192000) | `render/render.service.ts` |
| `RENDER_QUALITY`(standard) **`RENDER_WORKERS`(2)** | `hyperframes/hyperframes.service.ts` |
| `RENDERS_PER_POD`(1) | `render/render-queue.service.ts` |
| `WORK_DIR`(./work) `DOWNLOAD_TIMEOUT_MS`(60000) `MAX_DOWNLOAD_MB`(200) | `render/render-workspace.service.ts` |

`RENDER_WORKERS` 는 hyperframes 캡처 워커 수로 `createRenderJob({ workers })` 에 직접 넘긴다 (CLI 의 `--workers` 와 같음). 안 주면 엔진 auto 가 노드 전체 코어 수를 기준으로 늘리므로 기본값 2 를 둔다. `PRODUCER_HEADLESS_SHELL_PATH` 는 이미지 entrypoint 가 설정한다.

쿠버네티스가 넘기는 것: `NODE_ENV=production`, `PORT`, `LOG_LEVEL`, `RENDER_WORKERS`. 나머지는 기본값.

코드 상수(설정이 아닌 디자인 값): 강조 테두리 기본색 `#FF3B30`·두께 6px, 형광펜 `#FFE23A`·펜 `#E8453C`·글로우 `#FFB300` 기본색 (`composition.builder.ts`), 애니메이션 배율·진폭·리듬·획 모양·어둡기 (`effects/*.js` 상단, 브라우저 코드라 env 가 닿지 않음).

## 11. 로컬 실행과 이미지

```jsonc
"scripts": {
  "start:dev":    "nest start --watch",
  "build":        "nest build",
  "start:prod":   "node dist/main",
  "fixture":      "node scripts/make-fixture.mjs fixtures/sample",
  "smoke":        "node scripts/smoke.mjs fixtures/sample/request.json",   // HTTP 없이 Nest 컨텍스트로 RenderService 실행 (build 먼저)
  "check":        "hyperframes doctor",
  "test":         "vitest run",                 // 단위 + e2e
  "lint":         "eslint ...",  "format": "prettier --write ...",
  "docker:build": "docker build -t slide-video-renderer ."     // 이미지 로컬 검증용. 운영 이미지는 CI
}
```

`nest-cli.json`: `"assets": ["hyperframes/template.html", "hyperframes/effects/*.js"], "watchAssets": true`, plugins 에 `@nestjs/swagger`.

로컬 준비: `nvm use`(`.nvmrc` → 22) → `npm install` → `npm run check` (Chrome 없다고 하면 `npx hyperframes browser ensure`) → `npm run fixture` → `npm run start:dev`.

Dockerfile 요지 (hyperframes 공식 `packages/cli/src/docker/Dockerfile.render` 기반):

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG TARGETARCH=amd64
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg fonts-liberation libgbm1 libnss3 libatk-bridge2.0-0 libdrm2 \
      libxcomposite1 libxdamage1 libxrandr2 libcups2 libasound2 libpangocairo-1.0-0 \
      libxshmfence1 libxkbcommon0 && rm -rf /var/lib/apt/lists/*
# chrome-headless-shell: amd64 = chrome-for-testing, arm64 = Playwright 빌드 (Debian chromium arm64 는 크래시)
RUN if [ "$TARGETARCH" = "amd64" ]; then npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /opt/chrome; \
    else npx --yes playwright-core@1.61.1 install chromium-headless-shell; fi
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json entrypoint.sh ./      # entrypoint.sh: 설치된 바이너리를 찾아 PRODUCER_HEADLESS_SHELL_PATH export 후 node dist/main
ENV PUPPETEER_SKIP_DOWNLOAD=true NODE_ENV=production PORT=8080
ENTRYPOINT ["./entrypoint.sh"]
```

Dockerfile 은 Debian 저장소를 HTTPS 로 바꿔 쓴다. 일부 네트워크(이 Mac 포함)가 컨테이너의 평문 HTTP 를 막아서인데, slim 이미지에 CA 인증서가 없어 `ca-certificates` 를 설치할 때까지만 검증을 끈다. 평문 HTTP 가 되는 환경이면 그 두 줄은 빼도 된다.

운영 노드가 amd64 면 CI 에서 `--platform linux/amd64` 로 빌드한다. Apple Silicon 에서 그냥 빌드하면 arm64 이미지가 된다.

## 12. 쿠버네티스 운영팀 전달 사항

개발자가 빠진 뒤 문제가 되는 건 코드가 아니라 아래 항목이다. README 에도 같은 내용을 넣는다.

| 항목 | 값 / 요구 | 이유 |
|---|---|---|
| 스케일 단위 | **파드당 렌더 1개.** 처리량이 더 필요하면 replica 증가 | 파드 안 동시 실행은 코드 상수로 1 고정 (§9) |
| 리소스 | requests/limits: **CPU 2, 메모리 2Gi** (최소 CPU 1 / 1.5Gi) | Docker 벤치(§14): 컨테이너 메모리 피크 0.7~0.8GB 로 CPU·워커 수와 무관. CPU 2 면 영상 길이의 0.5~0.85배 시간에 렌더, CPU 1 이면 1.4배 (5분 영상 7.2분) |
| 호출 경로 | 클러스터 안에서 **ClusterIP Service 로 직접 호출** 권장. Ingress 를 거치면 `proxy-read-timeout` 을 **900s 이상**으로 | 동기 요청이 대기 포함 수 분. nginx 기본 60s 에 끊김 |
| 호출 측 클라이언트 | 응답 대기 타임아웃을 렌더 시간보다 길게 (Node `fetch` 기본 5분, RestTemplate/OkHttp read timeout) | 벤치에서 Node fetch 가 5분에 끊겨 렌더 완료 전 실패한 사례 있음 |
| 종료 유예 | `terminationGracePeriodSeconds: 660` 이상 | 기본 30s 면 배포·스케일다운마다 진행 중 렌더가 죽음. 대기열까지 비우려면 더 길게 |
| **preStop 훅** | `/health` 의 `rendering`·`queued` 가 0 이 될 때까지 대기 (상한 600s) | **필수.** SIGTERM 이 렌더 도중 오면 puppeteer 가 Chrome 을 닫아 그 요청이 500 `RENDER_FAILED` 가 된다 (§9). k8s 는 preStop 이 끝난 뒤 SIGTERM 을 보내므로 큐를 비우면 안전하다 |
| 볼륨 | NAS 를 PVC 로 마운트 → `outputPath` 가 그 아래. `/app/work` 는 emptyDir. `/dev/shm` 은 `emptyDir(medium: Memory)` 512Mi~1Gi | 결과는 NAS, 작업 폴더는 로컬 디스크. 벤치는 shm 256m 에서도 문제 없었지만 여유를 둔다 |
| 보안 정책 | `runAsNonRoot` 강제 시 Chrome 샌드박스 옵션 확인 필요 | 이미지 스모크 테스트에서 확인 (§14) |
| 프로브 | liveness / readiness 모두 `GET /health` | 응답에 `rendering`, `queued` 포함 |
| env | `NODE_ENV=production`, `PORT=8080`, `LOG_LEVEL=info`, **`RENDER_WORKERS=2`** | 워커를 안 주면 엔진 auto 가 노드 전체 코어 수를 봐서 파드 limit 을 넘김. 나머지 키는 기본값 |
| 이미지 | CI 빌드, amd64 | Apple Silicon 로컬 빌드는 arm64 |
| 로그 | stdout | 표준 수집기 |
| 오토스케일 | CPU 기준 HPA 가능. 단 스케일다운은 종료 유예를 지킨다 | 렌더가 CPU 를 꽉 쓰므로 지표가 잘 맞음 |

## 13. 로컬 테스트 픽스처

**(1) 합성 픽스처 — `npm run fixture`** → `fixtures/sample/`

- `objects.json`: 도형 4개(제목/차트/도형/본문)의 EMU 좌표에 효과 8개(box·spotlight·zoom-box·marker·circle·underline·shake·glow, 14초) + start/end/effect/color
- `slide.png`: sharp 로 1920×1080 SVG 렌더. 회색 배경 위에 **objects.json 과 같은 EMU 를 px 로 바꾼 위치에 색 박스** → 렌더 결과에서 강조 테두리가 색 박스에 정확히 겹치면 변환이 맞는 것
- `audio.mp3`: macOS `say -v Yuna "…" -o` + ffmpeg 변환(한국어 TTS, 8초 내외). `say` 없으면 ffmpeg `anullsrc` 무음 14초 (효과 8개가 순서대로 들어가는 길이)
- `request.json`: 위 파일의 절대경로 + `outputPath`(`fixtures/sample/out.mp4` 절대경로)가 들어간 완성된 POST 본문. 머신별 경로라 `fixtures/sample/` 은 gitignore. `smoke`·`api-test.sh` 는 없으면 자동 생성

```bash
curl -s http://localhost:8080/render -H 'Content-Type: application/json' -d @fixtures/sample/request.json
```

**(2) 실제 PPT** — 둘 중 편한 쪽

- python-pptx: `[{"left": s.left, "top": s.top, "width": s.width, "height": s.height} for s in prs.slides[2].shapes]` 를 그대로 `objects` 에
- Node `scripts/extract-pptx.mjs deck.pptx 3`: pptx(zip)에서 `ppt/slides/slide3.xml` 의 `<a:off x y><a:ext cx cy>` 를 `adm-zip` + `fast-xml-parser` 로 읽어 같은 JSON 생성

슬라이드 PNG 는 PowerPoint/Keynote "그림으로 내보내기"(1920×1080). start/end/effect 는 손으로 채운다.

**검증·디버깅 도구**

- `npm run smoke` — Nest 컨텍스트를 띄워 HTTP 없이 `RenderService.render()` 를 실행 (`npm run build` 먼저). 실패하면 `work/<jobId>` 가 남는다.
- `npm test` — Vitest. 단위(mapper, builder, semaphore) + e2e(supertest: /health, 400 두 종류).
- `bash scripts/api-test.sh` — 서버를 띄운 뒤 실행. 400 3종, 정상 렌더, 동시 3건, 대기 중 연결 끊김, SIGTERM 을 순서대로 검증한다 (`SIGTERM_TEST=0` 이면 서버를 살려둔다).
- `node scripts/debug-page.mjs work/<jobId>/index.html` — 컴포지션 페이지를 puppeteer 로 열어 타임라인 등록과 특정 시점의 opacity/transform 을 찍는다.
- `KEEP_TEMP=1` 로 렌더하면 엔진이 컴파일한 HTML 이 `work/<jobId>/work-*/compiled/` 에 남는다.

## 14. 구현 순서

1. ✅ **스모크 완료 (2026-09-10).** `scripts/smoke.mjs` 로 `executeRenderJob` 실행. 결과: 10.4초 영상(312프레임) → 렌더 9.3초(워커 6) / 9.8초(워커 2) / 10.6초(워커 1→최소 2). CPU 평균 약 2코어. 프로세스 트리 피크 메모리 2.4GB(워커 6) / 1.1GB(워커 2). 효과 4종 프레임 확인. 발견: 인라인 스크립트 재배치(§6), 타임라인 미등록 시 무경고 성공(§7), 워커 auto(§10)
2. ✅ **Nest 뼈대 완료 (2026-09-10).** DTO(class-validator) → RenderService → HyperframesService → 200. Swagger `/docs` 확인. 400 3종(스키마/없는 입력/start≥end·최소 길이) 확인
3. ✅ **효과 4종 완료.** 정의를 바로잡음: `zoom` 은 오려낸 조각 확대, `shake` 는 조각 흔들기 (§6). 프레임으로 확인
4. ✅ **직렬화 완료.** `scripts/api-test.sh` 로 검증: 동시 3건이 `rendering=1 queued=2` 로 순서대로(대기 0/8.8/17.5초), 대기 중 연결 끊긴 요청은 건너뜀, **SIGTERM 은 렌더 중이면 그 요청이 500** (§9, preStop 으로 대응). 20건 테스트는 호출 측 타임아웃(§15-1) 확인 후
5. NAS HTTP 다운로드 (운영 환경 확정 후)
6. ✅ **Dockerfile + Docker 벤치 완료 (2026-09-10, arm64 로컬).** 결과: 메모리 피크 0.68~0.80GB (CPU 1~4, 워커 1~4 모두 비슷). 렌더 시간 — 10초 영상: 19/10/9초, 60초 영상: 67/32/25초 (CPU 1/2/4), 300초 영상: 431초(CPU 1)/254초(CPU 2), 240초 영상(객체 3개): 221초(CPU 1, 피크 866MiB)/111초(CPU 2, 피크 699MiB). 2 CPU 컨테이너에 동시 3건 → 순서대로 처리되며 피크 0.69GB 유지(세마포어 확인). 미확인: amd64, non-root 실행
7. ✅ **README 완료.** 실행·API·스크립트·설정·구조·Spring 대응표·운영 전달 사항·디버깅. 구조 리팩터링(v3.3)과 함께

## 15. 열린 질문

1. 호출 측이 20개를 한 번에 던지고 **마지막 응답까지 몇 분씩 연결을 유지할 수 있는지** (호출 측 HTTP 타임아웃). 불가능하면 jobId 를 돌려주는 비동기 방식으로 바꿔야 하며 설계가 꽤 바뀐다
2. 운영에서 `outputPath` 가 **파드에 마운트된 NAS 경로**인지 확인. 마운트가 아니라 HTTP 업로드여야 하면 `outputPath` 를 URL 로 받아 6단계에서 PUT 하는 분기를 추가한다
3. NAS HTTP 다운로드에 인증 헤더가 있는지 → 있으면 `NAS_AUTH_HEADER` env 추가
4. PPT 가 전부 16:9 표준(12,192,000 EMU 폭)인지
5. 회전/그룹 도형 존재 여부 → 있으면 2차
