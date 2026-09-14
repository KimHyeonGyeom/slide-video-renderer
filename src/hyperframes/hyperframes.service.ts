import { Injectable } from '@nestjs/common';
import { createRenderJob, executeRenderJob, type ProducerLogger } from '@hyperframes/producer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';

const FPS = Number(process.env.RENDER_FPS) || 30;
const QUALITY = (process.env.RENDER_QUALITY || 'standard') as 'draft' | 'standard' | 'high';
/** hyperframes 캡처 워커 수 (CLI 의 --workers). 안 주면 엔진이 노드 전체 코어 수를 기준으로 늘린다 */
const WORKERS = Number(process.env.RENDER_WORKERS) || 2;

export interface RenderMp4Options {
  /** 로그용 */
  jobId: string;
  /** abort 되면 렌더를 중단하고 reject 한다 */
  signal?: AbortSignal;
}

export interface RenderMp4Result {
  /** 엔진이 남긴 경고 (치명적이지 않은 것) */
  warnings: string[];
}

/**
 * @hyperframes/producer 호출. hyperframes CLI 의 `render` 명령이 하는 것과 같은 두 함수(createRenderJob, executeRenderJob)를 쓴다.
 * 동시성·타임아웃 정책은 여기 없고 RenderService 에 있다.
 */
@Injectable()
export class HyperframesService {
  private readonly producerLogger: ProducerLogger;

  constructor(@InjectPinoLogger(HyperframesService.name) private readonly logger: PinoLogger) {
    this.producerLogger = toProducerLogger(logger.logger.child({ context: 'hyperframes' }));
  }

  /** projectDir/index.html 컴포지션을 outputPath(mp4) 로 렌더한다. */
  async renderMp4(projectDir: string, outputPath: string, options: RenderMp4Options): Promise<RenderMp4Result> {
    const job = createRenderJob({
      fps: FPS,
      quality: QUALITY,
      format: 'mp4',
      workers: WORKERS,
      logger: this.producerLogger,
    });

    let lastBucket = -1;
    await executeRenderJob(
      job,
      projectDir,
      outputPath,
      (current, message) => {
        const bucket = Math.floor(current.progress / 25) * 25; // 0, 25, 50, 75, 100 에서만 로그
        if (bucket !== lastBucket) {
          lastBucket = bucket;
          this.logger.debug({ jobId: options.jobId, progress: bucket }, message);
        }
      },
      options.signal,
    );

    const codes = job.warnings.map((w) => w.code);
    if (codes.some((c) => c.startsWith('sub_timeline'))) {
      // 엔진은 window.__timelines 등록을 45초 기다리다 포기하면 효과 없는 영상을 "성공"으로 낸다.
      throw new AppException(ErrorCode.COMPOSITION_NOT_ANIMATED, { details: codes });
    }
    return { warnings: job.warnings.map((w) => `${w.code}: ${w.message}`) };
  }
}

/**
 * producer 의 로거 인터페이스를 pino 로 잇는다. producer 의 info 는 렌더 추적 로그라 debug 로 내린다.
 * (엔진이 console.log 로 직접 찍는 줄은 여기를 거치지 않는다)
 */
function toProducerLogger(log: Logger): ProducerLogger {
  const meta = (m?: Record<string, unknown>) => m ?? {};
  return {
    error: (message, m) => log.error(meta(m), message),
    warn: (message, m) => log.warn(meta(m), message),
    info: (message, m) => log.debug(meta(m), message),
    debug: (message, m) => log.trace(meta(m), message),
    isLevelEnabled: (level) => log.isLevelEnabled(level === 'info' ? 'debug' : level === 'debug' ? 'trace' : level),
  };
}
