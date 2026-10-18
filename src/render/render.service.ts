import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Logger } from 'pino';
import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';
import { audioDurationSec } from '../common/utils/ffprobe.util.js';
import { CompositionBuilder } from '../hyperframes/composition.builder.js';
import { HyperframesService } from '../hyperframes/hyperframes.service.js';
import { RenderRequestDto } from './dto/render-request.dto.js';
import { RenderResponseDto } from './dto/render-response.dto.js';
import { RenderQueueService } from './render-queue.service.js';
import { RenderWorkspaceService, Workspace } from './render-workspace.service.js';
import { mapSlideObjects } from './slide-objects.mapper.js';

const WIDTH = Number(process.env.RENDER_WIDTH) || 1920;
const HEIGHT = Number(process.env.RENDER_HEIGHT) || 1080;
const FPS = Number(process.env.RENDER_FPS) || 30;
/** 렌더 1건 상한(ms). 대기 시간은 포함하지 않는다 */
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS) || 600_000;
/** PPT 슬라이드 폭(EMU). 16:9 표준 = 12,192,000 → 1920px 기준 1px = 6350 EMU */
const EMU_PER_PX = (Number(process.env.SLIDE_WIDTH_EMU) || 12_192_000) / WIDTH;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface RenderTiming {
  queuedMs: number;
  renderMs: number;
  engineWarnings: string[];
}

/**
 * 요청 1건의 흐름 (DESIGN.md §8). 각 단계의 일은 담당 클래스에 있고 여기는 순서만 안다.
 *  1. 작업 폴더           RenderWorkspaceService
 *  2. 입력 확보           Workspace.fetchInputs  (URL 다운로드 / 로컬 복사)
 *  3. 음성 길이           ffprobe
 *  4. 검증 + EMU→px       mapSlideObjects
 *  5. 컴포지션 파일       CompositionBuilder → Workspace.materialize
 *  6. 렌더 (파드당 1개)   RenderQueueService → HyperframesService
 *  7. 결과 이동           Workspace.deliver
 *  8. 정리                Workspace.cleanup
 */
@Injectable()
export class RenderService {
  constructor(
    private readonly workspaces: RenderWorkspaceService,
    private readonly queue: RenderQueueService,
    private readonly builder: CompositionBuilder,
    private readonly hyperframes: HyperframesService,
    @InjectPinoLogger(RenderService.name) private readonly logger: PinoLogger,
  ) {}

  async render(dto: RenderRequestDto, clientSignal?: AbortSignal): Promise<RenderResponseDto> {
    const jobId = randomUUID();
    const log = this.logger.logger.child({ jobId, slideId: dto.slideId }); // 이 요청의 모든 로그에 jobId 가 붙는다
    const ws = await this.workspaces.create(jobId, dto.outputPath);
    let keepWorkDir = false;

    try {
      // 요청 필드 ↔ 내부 입력 이름의 대응은 이 한 줄뿐. 요청 JSON 이 바뀌면 DTO 와 이 줄만 바뀐다
      const inputs = await ws.fetchInputs({ slide: dto.slideImage, audio: dto.audio });
      const durationSec = await this.probeDuration(inputs.audio);
      const { objects, warnings } = mapSlideObjects(dto.objects, durationSec, EMU_PER_PX);

      const composition = await this.builder.build({ inputs, objects, durationSec, width: WIDTH, height: HEIGHT, fps: FPS });
      warnings.push(...composition.warnings);
      await ws.materialize(composition.files);

      const timing = await this.renderQueued(ws, clientSignal, log);
      warnings.push(...timing.engineWarnings);

      await ws.deliver();
      log.info({ outputPath: dto.outputPath, queuedMs: timing.queuedMs, renderMs: timing.renderMs }, 'render done');

      return {
        slideId: dto.slideId,
        outputPath: dto.outputPath,
        durationSec,
        queuedMs: timing.queuedMs,
        renderMs: timing.renderMs,
        warnings,
      };
    } catch (err) {
      const exception = toAppException(err, jobId);
      // 개발 환경에서 렌더 자체가 실패한 경우만 작업 폴더를 남긴다 (400 과 클라이언트 이탈은 남길 게 없다)
      keepWorkDir = !IS_PRODUCTION && exception.status >= 500 && exception.code !== ErrorCode.CLIENT_DISCONNECTED.code;
      throw exception;
    } finally {
      await ws.cleanup(keepWorkDir);
    }
  }

  private async probeDuration(audioFile: string): Promise<number> {
    try {
      return await audioDurationSec(audioFile);
    } catch (err) {
      throw new AppException(ErrorCode.INPUT_NOT_READABLE, {
        message: `audio has no readable duration: ${(err as Error).message}`,
        cause: err,
      });
    }
  }

  /** 슬롯을 기다렸다가 렌더한다. 타임아웃은 렌더가 시작된 뒤부터 잰다. */
  private async renderQueued(ws: Workspace, clientSignal: AbortSignal | undefined, log: Logger): Promise<RenderTiming> {
    const queuedAt = Date.now();
    const release = await this.queue.acquire();
    try {
      const queuedMs = Date.now() - queuedAt;
      if (clientSignal?.aborted) {
        throw new AppException(ErrorCode.CLIENT_DISCONNECTED, { message: 'client disconnected while queued' });
      }
      const timeout = AbortSignal.timeout(TIMEOUT_MS);
      const signal = clientSignal ? AbortSignal.any([timeout, clientSignal]) : timeout;

      log.info({ queuedMs }, 'render start');
      const startedAt = Date.now();
      try {
        const { warnings } = await this.hyperframes.renderMp4(ws.dir, ws.renderedFile, { jobId: ws.jobId, signal });
        return { queuedMs, renderMs: Date.now() - startedAt, engineWarnings: warnings };
      } catch (err) {
        if (timeout.aborted) throw new AppException(ErrorCode.RENDER_TIMEOUT, { cause: err });
        if (clientSignal?.aborted) throw new AppException(ErrorCode.CLIENT_DISCONNECTED, { cause: err });
        throw err;
      }
    } finally {
      release();
    }
  }
}

/** 어떤 에러든 jobId 가 붙은 AppException 으로. 모르는 에러는 RENDER_FAILED. */
function toAppException(err: unknown, jobId: string): AppException {
  if (err instanceof AppException) return err.jobId ? err : err.withJobId(jobId);
  const message = err instanceof Error ? err.message : String(err);
  return new AppException(ErrorCode.RENDER_FAILED, { jobId, message, cause: err });
}
