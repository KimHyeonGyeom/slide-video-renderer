# slide-video-renderer

PPT 슬라이드 이미지 + 음성(mp3) + 슬라이드 객체 좌표(EMU) 를 받아, **음성 길이만큼의 mp4** 에 객체 강조 효과(테두리 / 확대 / 흔들기 / 형광펜 / 동그라미 / 밑줄 / 글로우 / 스포트라이트)를 넣어 렌더하는 HTTP 서비스.
렌더 엔진은 [HyperFrames](https://github.com/heygen-com/hyperframes)(HTML → 영상), 서버는 NestJS.

설계와 결정 근거는 [DESIGN.md](DESIGN.md) 에 있다. 이 문서는 **실행·구조·운영**만 다룬다.

## 빠른 시작 (로컬)

요구: Node 22 (`.nvmrc`), ffmpeg/ffprobe (`brew install ffmpeg`). Chrome 은 `npm install` 때 puppeteer 가 내려받는다.

```bash
nvm use                 # .nvmrc → 22
npm install
npm run fixture         # fixtures/sample/ 에 테스트용 슬라이드 PNG·음성·요청 JSON 생성 (내 머신 절대경로로)
npm run start:dev       # http://localhost:8080  (Swagger: /docs, 헬스: /health)
```

다른 터미널에서:

```bash
curl -s -X POST http://localhost:8080/render -H 'Content-Type: application/json' -d @fixtures/sample/request.json
# → fixtures/sample/out.mp4
```

`fixtures/sample/` 은 머신별 절대경로가 들어가므로 커밋하지 않는다(gitignore). 각자 `npm run fixture` 로 만든다.

## API

`POST /render` — 슬라이드 1장을 렌더한다. **동기**: 렌더가 끝날 때까지 응답하지 않는다(대기 포함 수 분 가능).

```jsonc
{
  "slideId": "deck01-s03",                             // 선택. 로그/응답 식별용
  "slideImage": "https://nas.example/deck01/s03.png",  // http(s) URL 또는 서버(파드) 기준 절대경로
  "audio":      "https://nas.example/deck01/s03.mp3",
  "outputPath": "/mnt/nas/deck01/s03.mp4",             // 결과 mp4 절대경로 (서버/파드 기준). 폴더는 만들고 같은 파일은 덮어씀
  "objects": [
    { "id": "title",
      "left": 838200, "top": 365125, "width": 10515600, "height": 1325563,   // EMU (python-pptx shape.left/top/width/height 그대로)
      "start": 0.5, "end": 3.0,                        // 초
      "effect": "box",                                 // box | zoom | shake | zoom-box | marker | circle | underline | glow | spotlight
      "color": "#FF3B30" }                             // 선택. box/zoom-box 테두리, marker 형광펜, circle/underline 펜, glow 빛 색
  ]
}
```

| effect | 동작 |
|---|---|
| `box` | 객체 주위 테두리가 나타났다 사라진다 |
| `zoom` | 객체 영역을 오려낸 조각이 제자리에서 1.18배까지 서서히 커졌다가 되돌아온다 |
| `shake` | 오려낸 조각이 살짝 떠서 좌우로 짧게 흔들리고 쉬기를 반복한다 |
| `zoom-box` | zoom + 조각에 테두리 |
| `marker` | 객체 위에 형광펜을 긋는다. 가장자리가 울퉁불퉁하고 살짝 기울며, 넓고 높은 상자(여러 줄 텍스트)는 줄마다 왼쪽에서 오른쪽으로 긋는다. 색은 `color`(기본 노랑) |
| `circle` | 펜으로 객체 둘레를 한 바퀴 조금 넘게 둘러 그린다. 두 바퀴째가 살짝 바깥으로 벗어나 손으로 그린 느낌. 색은 `color`(기본 빨강) |
| `underline` | 객체 아래쪽에 손글씨 밑줄 한 줄을 왼쪽에서 오른쪽으로 긋는다. 형광펜이 무거울 때. 색은 `color`(기본 빨강) |
| `glow` | 부드러운 빛 테두리가 숨 쉬듯 두세 번 커졌다 작아진다. 약한 단계의 강조. 색은 `color`(기본 호박색) |
| `spotlight` | 객체만 남기고 화면 전체를 어둡게 덮었다가 걷는다. 어두운 슬라이드에서도 통한다. 같은 시간에 두 객체에 걸면 서로를 어둡게 하니 겹치지 말 것 |

**로컬과 운영을 구분하는 스위치는 없다.** 값의 형태가 처리 방식을 정한다. `slideImage`/`audio` 가 `http(s)://` 로 시작하면 다운로드하고, 아니면 서버가 읽을 수 있는 절대경로로 본다. `outputPath` 는 항상 서버가 쓸 수 있는 절대경로다. 로컬은 내 디스크 경로, 운영은 NAS URL(입력)과 파드에 마운트된 NAS 경로(출력)가 된다. 요청 필드와 내부 입력 이름의 대응은 `render.service.ts` 의 `fetchInputs({ slide: dto.slideImage, audio: dto.audio })` 한 줄에만 있다.

응답 200: `{ slideId, outputPath, durationSec, queuedMs, renderMs, warnings[] }` — `queuedMs` 가 크면 replica 를 늘릴 신호.

에러는 전부 같은 형태다: `{ statusCode, error, message, jobId?, details? }`. `error` 는 [error-code.ts](src/common/exceptions/error-code.ts) 의 코드.

| statusCode | error | 언제 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 필드 형식 위반 (`message` 는 항목 배열) |
| 400 | `INPUT_NOT_READABLE` | 입력 파일을 못 읽음 (없는 경로, 다운로드 실패, 크기 초과) |
| 400 | `INVALID_HIGHLIGHT` | start ≥ end, 구간 0.3초 미만 |
| 504 | `RENDER_TIMEOUT` | 렌더 시작 후 `RENDER_TIMEOUT_MS` 초과 |
| 500 | `RENDER_FAILED` / `COMPOSITION_NOT_ANIMATED` | 엔진 실패 / 효과가 빠진 영상이 나올 상황 |

`GET /health` — liveness/readiness. `info.renderQueue` 에 `rendering`, `queued`.

전체 스키마는 서버의 `/docs` (Swagger).

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run start:dev` | 개발 서버 (파일 변경 시 재시작) |
| `npm run build` / `npm run start:prod` | 빌드 / 빌드 결과 실행 |
| `npm test` | 단위 + e2e 테스트 (Vitest) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run fixture` | 테스트 픽스처 생성 |
| `npm run smoke` | HTTP 없이 렌더 파이프라인 1회 실행 (`build` 먼저) |
| `bash scripts/api-test.sh` | 서버를 띄운 뒤 실행. 400 3종·정상 렌더·동시 3건·연결 끊김·SIGTERM 검증 |
| `npm run check` | `hyperframes doctor` — ffmpeg/Chrome 점검 |

## 실제 덱으로 테스트하기

pptx 한 개를 슬라이드별 묶음(이미지·음성·요청)으로 만들고, 골라서 호출한다. 생성물은 `fixtures/deck/<덱이름>/slide-N/` 에 모이고 커밋하지 않는다.

```bash
# 1) 슬라이드 이미지: PowerPoint/Keynote 에서 "내보내기 > PDF" (또는 슬라이드별 PNG 폴더)
# 2) 묶음 생성: 객체 추출 + 슬라이드 이미지 + TTS 음성(10초~5분, 슬라이드마다 다르게) + request.json
npm run deck:prepare -- --pptx deck.pptx --pdf deck.pdf            # 또는 --images 폴더
# 3) 호출: 하나 / 여러 개 / 범위 / 전체, --parallel N 이면 N개씩 동시에
npm run deck:render -- fixtures/deck/deck 3
npm run deck:render -- fixtures/deck/deck 1,4,7 --parallel 3
npm run deck:render -- fixtures/deck/deck all
```

- `request.json` 은 손으로 고쳐도 된다. 다시 `deck:prepare` 를 돌려도 있는 파일은 덮어쓰지 않는다 (`--force-requests` 로 요청만, `--force` 로 전부 재생성).
- `audio.mp3` 를 실제 나레이션으로 바꿔 넣으면 그걸 쓴다.
- 결과: `out.mp4`, `result.json`(응답), `frames.png`(객체마다 강조 중간 시점 프레임을 이어 붙인 검증용 한 장).
- 객체 선택 규칙과 효과 배정은 [deck-prepare.mjs](scripts/deck-prepare.mjs) 의 `pickObjects` / `planHighlights` 에 있다. 그룹·연결선·회전 객체·배경 패널·장식 도형은 제외한다.

## 설정

값은 env 로 준다. 로컬은 `.env` 파일(커밋하지 않음), 운영은 Deployment env. 코드는 각 파일 맨 위에서 `process.env` 를 직접 읽고 없으면 기본값을 쓴다. 키 목록과 설명은 [.env.example](.env.example).

```bash
cp .env.example .env    # 로컬. 필요한 값만 고친다
```

`.env` 는 [main.ts](src/main.ts) 첫 줄의 `import 'dotenv/config'` 가 읽는다. 이미 있는 환경변수가 `.env` 보다 우선이라, 운영에서는 `.env` 없이 Deployment env 만으로 동작한다.

| 키 | 읽는 곳 |
|---|---|
| `PORT` | [main.ts](src/main.ts) |
| `LOG_LEVEL`, `NODE_ENV` | [app.module.ts](src/app.module.ts) (로거) |
| `RENDER_WIDTH`, `RENDER_HEIGHT`, `RENDER_FPS`, `RENDER_TIMEOUT_MS`, `SLIDE_WIDTH_EMU` | [render.service.ts](src/render/render.service.ts) |
| `RENDER_FPS`, `RENDER_QUALITY`, `RENDER_WORKERS` | [hyperframes.service.ts](src/hyperframes/hyperframes.service.ts) |
| `RENDERS_PER_POD` | [render-queue.service.ts](src/render/render-queue.service.ts) |
| `WORK_DIR`, `DOWNLOAD_TIMEOUT_MS`, `MAX_DOWNLOAD_MB` | [render-workspace.service.ts](src/render/render-workspace.service.ts) |

쿠버네티스가 넘길 것: `NODE_ENV=production`, `PORT`, `LOG_LEVEL`, `RENDER_WORKERS`(파드 CPU 수에 맞춤, 권장 2). 나머지는 기본값.

코드 상수로 남긴 것: 강조 테두리 기본색·두께와 형광펜·펜·글로우 기본색([composition.builder.ts](src/hyperframes/composition.builder.ts)), 애니메이션 배율·진폭·리듬([effects/](src/hyperframes/effects) 각 파일 상단).

## 구조

```
src/
├─ main.ts                        # bootstrap: 로거, ValidationPipe, Swagger, 서버 타임아웃, shutdown hooks
├─ app.module.ts                  # 모듈 조립 + 전역 예외 필터 + pino 로거 설정 (설정은 각 파일이 process.env 로 직접 읽는다)
├─ common/
│  ├─ exceptions/                 # ErrorCode 표 + AppException (서비스가 던지는 유일한 예외)
│  ├─ filters/                    # GlobalExceptionFilter: 예외 → HTTP 응답을 만드는 유일한 곳
│  ├─ dto/                        # ErrorResponseDto
│  └─ utils/                      # emu, ffprobe, download, semaphore (순수 함수)
├─ health/                        # /health (terminus)
├─ render/
│  ├─ render.controller.ts        # HTTP 만
│  ├─ render.service.ts           # 요청 1건의 흐름 (아래 8단계). 각 단계의 일은 담당 클래스에
│  ├─ render-workspace.service.ts # 파일시스템: work/<jobId> 생성, 입력 확보(URL/로컬), 결과 이동, 정리
│  ├─ render-queue.service.ts     # 파드당 렌더 수 제한 (Semaphore) + 상태
│  ├─ slide-objects.mapper.ts     # DTO → px 객체 + 필드 간 검증 (순수 함수)
│  └─ dto/
└─ hyperframes/                   # HyperFrames 를 아는 유일한 곳
   ├─ hyperframes.service.ts      # @hyperframes/producer 호출 + 경고 검사
   ├─ composition.builder.ts      # 프로젝트 폴더 구성 결정: index.html, 데이터 스크립트, 자산 이름
   ├─ template.html               # 컴포지션 마크업
   └─ effects/                    # 브라우저에서 도는 GSAP 효과. common.js(공통 헬퍼) · box.js · zoom.js · shake.js · marker.js · circle.js · underline.js · glow.js · spotlight.js · index.js(진입)
```

요청 1건의 흐름 (`render.service.ts`):
작업 폴더 → 입력 확보 → 음성 길이(ffprobe) → 검증·EMU→px → 컴포지션 파일 → **렌더(파드당 1개, 나머지는 대기)** → `outputPath` 로 이동 → 정리.

### 새 효과 추가하기

1. [render-request.dto.ts](src/render/dto/render-request.dto.ts) 의 `EFFECTS` 에 이름 추가
2. [composition.builder.ts](src/hyperframes/composition.builder.ts) 의 `ELEMENT_KIND` 에 요소 종류 추가 (`box` = 테두리 div, `cut` = 객체 영역을 오려낸 조각 div, `fx` = 빈 컨테이너 div. 효과 파일이 그려 넣고 색은 `--color` 로 받는다. 펜·곡선·시드 난수 헬퍼는 common.js)
3. `src/hyperframes/effects/<이름>.js` 에 `window.HL.effects.<이름> = function (tl, o, ctx) { ... }` — GSAP tween 을 `tl` 에 추가한다. 시그니처와 규칙은 [common.js](src/hyperframes/effects/common.js) 머리말 참고

빌더가 폴더를 읽어 script 태그와 복사 목록을 만들므로 template.html 은 손대지 않는다. 새 CSS 가 필요하면 template.html 의 `<style>` 에 추가한다.

## Spring 에 익숙하다면

| Nest | Spring |
|---|---|
| `@Module` providers / imports / exports | `@Configuration`, 컴포넌트 스캔 — 단, Nest 는 **명시 등록**. 빠지면 "can't resolve dependencies" |
| `@Controller` + `@Post()` | `@RestController` + `@PostMapping` |
| `@Injectable` 서비스, 생성자 주입 | `@Service`, 생성자 주입 |
| DTO + class-validator + `ValidationPipe` | DTO + Bean Validation + `@Valid` |
| `AppException(ErrorCode)` + `GlobalExceptionFilter` | `BusinessException(ErrorCode)` + `@RestControllerAdvice` |
| 각 파일 맨 위의 `process.env` + `.env` | `application.yml` / 환경변수 |
| `nestjs-pino` (JSON 로그, 요청마다 `reqId`/`jobId`) | Logback JSON + MDC |
| `@nestjs/terminus` `/health` | Actuator `/actuator/health` |
| `@nestjs/swagger` `/docs` | springdoc-openapi |
| `Semaphore` (`common/utils`) | `java.util.concurrent.Semaphore` |
| Vitest + supertest | JUnit + MockMvc |

걸려 넘어지기 쉬운 것:

- **스레드 풀이 없다.** 단일 이벤트 루프라 JS 가 CPU 를 오래 쓰면 요청 전체가 멈춘다. 이 서비스의 무거운 일은 Chrome/ffmpeg 자식 프로세스라 괜찮고, 동시 처리 제한은 스레드 수가 아니라 `RENDERS_PER_POD`(Semaphore) 다.
- **ESM 프로젝트.** `@hyperframes/producer` 가 ESM 전용이라 CommonJS 로는 못 불러온다. 상대 import 는 `.js` 확장자를 붙인다 (`import { X } from './x.service.js'`), `__dirname` 대신 `import.meta.url`.
- **빌드는 Nest CLI.** DI 가 `emitDecoratorMetadata` 에 의존해 `tsx` 로는 못 돌린다. 같은 이유로 생성자 파라미터 타입을 `import type` 으로 바꾸면 안 된다.

## Docker

```bash
npm run docker:build                                     # 이 Mac 에서는 arm64. 운영 노드가 amd64 면 --platform linux/amd64
docker run --rm -p 8080:8080 --shm-size=1g -e RENDER_WORKERS=2 \
  -v "$PWD/fixtures:$PWD/fixtures" slide-video-renderer  # 로컬 픽스처의 절대경로가 컨테이너 안에서도 같도록 같은 경로에 마운트
```

이미지는 Node 22 + ffmpeg + chrome-headless-shell(`/opt/chrome`) 이고, `entrypoint.sh` 가 Chrome 경로를 찾아 hyperframes 에 넘긴 뒤 서버를 띄운다. 로그는 JSON 한 줄.

파드 크기의 근거는 CPU·메모리를 제한한 컨테이너에서 같은 슬라이드를 렌더해 잰다:

```bash
bash scripts/docker-bench.sh "1 1g 1 256m" "2 2g 2 512m" "4 4g 4 1g"   # "<cpus> <memory> <workers> <shm>" 조건마다 컨테이너를 띄워 deck:render
SLIDES=16 bash scripts/docker-bench.sh "2 2g 2 512m"                     # 5분짜리로 타임아웃 확인
```

조건마다 벽시계 시간, 메모리 피크, OOM 여부, 슬라이드별 렌더 시간이 표로 나오고 상세 로그는 `work/bench/` 에 남는다.

알아둘 것: `esbuild` 가 우리 dependencies 에 있는 이유는 `@hyperframes/producer` 가 런타임에 import 하면서 자기 의존성에 선언하지 않았기 때문이다. 빼면 `npm prune --omit=dev` 된 컨테이너에서 기동 실패한다. Dockerfile 의 apt 는 HTTPS 저장소를 쓴다(일부 네트워크가 컨테이너의 평문 HTTP 를 막음).

## 운영 (쿠버네티스)

| 항목 | 값 / 요구 | 이유 |
|---|---|---|
| 스케일 단위 | **파드당 렌더 1개.** 처리량이 더 필요하면 replica 증가 | 파드 안 동시 실행은 `RENDERS_PER_POD=1` |
| 리소스 | requests/limits: **CPU 2, 메모리 2Gi** (최소 CPU 1 / 1.5Gi) | Docker 벤치: 메모리 피크 0.7~0.8GB. CPU 2 면 영상 길이의 0.5~0.85배 시간에 렌더, CPU 1 이면 1.4배 |
| env | `NODE_ENV=production`, `PORT=8080`, `LOG_LEVEL=info`, **`RENDER_WORKERS=2`** | 워커 auto 는 노드 전체 코어 수를 봐서 파드 limit 을 넘김 |
| 호출 경로 | 클러스터 안에서 **ClusterIP Service 로 직접 호출** 권장. Ingress 를 거치면 `proxy-read-timeout` 900s 이상 | 동기 요청이 대기 포함 수 분. nginx 기본 60s 에 끊김 |
| 호출 측 클라이언트 | 응답 대기 타임아웃을 **렌더 시간보다 길게** (Node `fetch` 는 기본 5분에 끊김, Java `HttpClient` 는 기본 무제한, RestTemplate/OkHttp 는 read timeout 설정 필요) | 5분짜리 영상은 응답까지 4~6분 걸린다 |
| 종료 유예 | `terminationGracePeriodSeconds: 660` 이상 | 기본 30s 면 배포·스케일다운마다 진행 중 렌더가 죽음 |
| **preStop 훅** | `/health` 의 `rendering`·`queued` 가 0 이 될 때까지 대기 (상한 600s) | **필수.** SIGTERM 이 렌더 도중 오면 puppeteer 가 Chrome 을 닫아 그 요청이 500 `RENDER_FAILED` 가 된다. k8s 는 preStop 이 끝난 뒤 SIGTERM 을 보내므로 큐를 비우면 안전하다 |
| 볼륨 | NAS 를 PVC 로 마운트 → `outputPath` 가 그 아래. `/app/work` 는 emptyDir. `/dev/shm` 은 `emptyDir(medium: Memory)` 1Gi | 결과는 NAS, 작업 폴더는 로컬 디스크, Chrome 은 shm 부족 시 크래시 |
| 보안 정책 | `runAsNonRoot` 강제 시 Chrome 샌드박스 옵션 확인 | 이미지 스모크 테스트에서 확인 |
| 프로브 | liveness / readiness 모두 `GET /health` | |
| 로그 | stdout JSON 한 줄. 요청 로그에 `reqId`, 렌더 로그에 `jobId`·`slideId` | `LOG_LEVEL=debug` 면 hyperframes 추적 로그까지 나온다 |

렌더 시간 (Docker 벤치, arm64): CPU 2 기준 10초 영상 10초, 60초 영상 32초, 300초 영상 254초. CPU 1 이면 각각 19초, 67초, 431초. 20건이 한꺼번에 오면 파드 1개는 순서대로 처리하므로 마지막 응답까지 `20 × 렌더 시간` 이 걸린다.

| CPU | 메모리 | 워커 | 10초 영상 | 60초 영상 | 300초 영상 | 메모리 피크 |
|---|---|---|---|---|---|---|
| 1 | 1GB | 1 | 19초 | 67초 | 431초 | 796MiB |
| 2 | 2GB | 2 | 10초 | 32초 | 254초 | 709MiB |
| 4 | 4GB | 4 | 9초 | 25초 | - | 699MiB |

같은 2 CPU 컨테이너에 요청 3건을 동시에 보내도 순서대로 처리되며 메모리 피크는 693MiB 로 한 건 분량을 유지한다.

## 디버깅

- 실패한 렌더는 개발 환경(`NODE_ENV != production`)에서 `work/<jobId>/` 가 남는다. 응답의 `jobId` 로 찾는다.
- `node scripts/debug-page.mjs work/<jobId>/index.html` — 컴포지션 페이지를 puppeteer 로 열어 타임라인 등록·특정 시점의 opacity/transform 을 찍는다.
- `KEEP_TEMP=1` 로 렌더하면 엔진이 컴파일한 HTML 이 `work/<jobId>/work-*/compiled/` 에 남는다.
- HyperFrames 의 함정(인라인 스크립트 재배치, 타임라인 미등록 시 조용한 성공)은 [DESIGN.md §6](DESIGN.md) 에 정리돼 있다.
