import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';
import { RenderRequestDto } from '../render/dto/render-request.dto.js';
import type { RenderResultDto } from '../render/dto/render-result.dto.js';
import { RenderService } from '../render/render.service.js';
import { REDIS, REDIS_BLOCKING } from './redis.module.js';

const INPUT_KEY = process.env.REDIS_INPUT_KEY || 'render:input';
const OUTPUT_KEY = process.env.REDIS_OUTPUT_KEY || 'render:output';
/** BRPOP 최대 대기(초). 메시지가 오면 즉시 깨고, 이 시간이 지나면 중단 여부를 확인하고 다시 기다린다 */
const BRPOP_TIMEOUT_SEC = Number(process.env.REDIS_BRPOP_TIMEOUT_SEC) || 5;
/** 결과 LPUSH 재시도 횟수 */
const PUSH_ATTEMPTS = 5;

/** 출력 큐 메시지. 입력 1건마다 정확히 1건 — 성공이든, 렌더 실패든, 메시지 자체가 잘못됐든 */
export type OutputMessage =
  | ({ jobId: string; status: 'ok' } & RenderResultDto)
  | { jobId: string; status: 'error'; slideId?: string; error: { code: string; message: string; details?: unknown } };

export interface CurrentJob {
  jobId: string;
  slideId?: string;
  startedAt: string;
}

export interface ConsumerStatus {
  /** 일반 연결의 ioredis 상태: ready | connecting | reconnecting | end ... */
  redis: string;
  /** true 면 새 작업을 더 꺼내지 않는다 (drain 호출 또는 종료 중) */
  draining: boolean;
  /** 지금 렌더 중인 작업. 없으면 null */
  current: CurrentJob | null;
}

/**
 * 입력 큐(BRPOP) → RenderService → 출력 큐(LPUSH). 파드 하나에 루프 하나라 렌더는 순차 처리된다.
 * 여러 파드가 같은 입력 큐를 BRPOP 하면 Redis 가 메시지 하나를 파드 하나에만 주므로 노는 파드가 알아서 가져간다.
 * BRPOP 은 꺼내는 순간 큐에서 지워진다: 렌더 중 파드가 죽으면 그 작업은 출력 없이 사라진다 (호출 측이 타임아웃으로 재투입).
 * Spring 의 @KafkaListener / @RabbitListener 메서드에 해당.
 */
@Injectable()
export class RenderConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private draining = false;
  private current: CurrentJob | null = null;
  private loop?: Promise<void>;

  constructor(
    @Inject(REDIS_BLOCKING) private readonly blocking: Redis,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly renderer: RenderService,
    @InjectPinoLogger(RenderConsumer.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.loop = this.run();
  }

  /** SIGTERM: 새 작업은 더 안 꺼내고 진행 중 작업만 끝낸 뒤 연결을 닫는다 */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.drain();
    await this.loop;
    await this.redis.quit().catch(() => undefined);
    this.logger.info({ signal }, 'consumer stopped');
  }

  /**
   * 새 작업을 그만 꺼낸다. 진행 중 작업은 끝까지 간다. 되돌릴 수 없으므로 이후엔 파드를 내려야 한다.
   * k8s preStop 이 POST /drain 으로 부른 뒤 GET /health 의 consumer.current 가 null 이 될 때까지 기다린다.
   */
  drain(): ConsumerStatus {
    if (!this.draining) {
      this.draining = true;
      this.blocking.disconnect(); // 대기 중인 BRPOP 을 즉시 풀어 루프가 빠져나오게 한다
      this.logger.info('draining: no more jobs will be taken');
    }
    return this.status();
  }

  status(): ConsumerStatus {
    return { redis: this.redis.status, draining: this.draining, current: this.current };
  }

  private async run(): Promise<void> {
    this.logger.info({ inputKey: INPUT_KEY, outputKey: OUTPUT_KEY, brpopTimeoutSec: BRPOP_TIMEOUT_SEC }, 'consumer started');
    while (!this.draining) {
      let popped: [string, string] | null;
      try {
        popped = await this.blocking.brpop(INPUT_KEY, BRPOP_TIMEOUT_SEC);
      } catch (err) {
        if (this.draining) break;
        this.logger.warn({ err }, 'brpop failed; retrying'); // 연결 문제. ioredis 가 뒤에서 재접속한다
        await sleep(1000);
        continue;
      }
      if (popped) await this.handle(popped[1]);
    }
  }

  private async handle(raw: string): Promise<void> {
    const jobId = randomUUID();
    let slideId: string | undefined;
    let output: OutputMessage;
    try {
      const parsed = parseJson(raw);
      slideId = typeof parsed.slideId === 'string' ? parsed.slideId : undefined;
      const dto = await toDto(parsed);
      this.current = { jobId, slideId, startedAt: new Date().toISOString() };
      const result = await this.renderer.render(dto, jobId);
      output = { jobId, status: 'ok', ...result };
    } catch (err) {
      const ex = toAppException(err);
      const fields = { jobId, slideId, code: ex.code, details: ex.details };
      // 400 대(입력 문제)는 호출 측 사정이라 warn, 5xx(우리/엔진 문제)는 error + 스택
      if (ex.status >= 500) this.logger.error({ ...fields, err: ex }, ex.message);
      else this.logger.warn(fields, ex.message);
      output = { jobId, status: 'error', slideId, error: { code: ex.code, message: ex.message, details: ex.details } };
    } finally {
      this.current = null;
    }
    await this.pushResult(output);
  }

  /** 결과는 반드시 남긴다. 페일오버 순간을 넘기도록 몇 번 재시도 */
  private async pushResult(output: OutputMessage): Promise<void> {
    const payload = JSON.stringify(output);
    for (let attempt = 1; ; attempt++) {
      try {
        await this.redis.lpush(OUTPUT_KEY, payload);
        return;
      } catch (err) {
        if (attempt >= PUSH_ATTEMPTS) {
          this.logger.error({ err, output }, 'failed to push result; giving up');
          return;
        }
        this.logger.warn({ err, attempt }, 'lpush failed; retrying');
        await sleep(1000 * attempt);
      }
    }
  }
}

function parseJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppException(ErrorCode.VALIDATION_FAILED, { message: 'message is not valid JSON', details: raw.slice(0, 200) });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppException(ErrorCode.VALIDATION_FAILED, { message: 'message must be a JSON object' });
  }
  return parsed as Record<string, unknown>;
}

/** HTTP 때 ValidationPipe 가 하던 일: DTO 로 변환하고 class-validator 로 검증. 모르는 필드는 버린다 */
async function toDto(parsed: Record<string, unknown>): Promise<RenderRequestDto> {
  const dto = plainToInstance(RenderRequestDto, parsed);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length > 0) {
    const messages = flatten(errors);
    throw new AppException(ErrorCode.VALIDATION_FAILED, { message: messages.join('; '), details: messages });
  }
  return dto;
}

/** ValidationError 트리 → "objects.0.effect must be one of ..." 식의 문장 목록 */
function flatten(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((m) => (prefix ? `${prefix}.${m}` : m));
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

function toAppException(err: unknown): AppException {
  if (err instanceof AppException) return err;
  return new AppException(ErrorCode.RENDER_FAILED, { message: err instanceof Error ? err.message : String(err), cause: err });
}
