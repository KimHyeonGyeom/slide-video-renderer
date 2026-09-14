import 'reflect-metadata';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/exceptions/app.exception.js';
import { ErrorCode } from '../common/exceptions/error-code.js';
import { RenderRequestDto } from '../render/dto/render-request.dto.js';
import type { RenderResultDto } from '../render/dto/render-result.dto.js';
import type { RenderService } from '../render/render.service.js';
import { RenderConsumer, type OutputMessage } from './render.consumer.js';

const UUID = /^[0-9a-f-]{36}$/;
const request = {
  slideId: 's1',
  slideImage: '/x/slide.png',
  audio: '/x/audio.mp3',
  outputPath: '/out/s1.mp4',
  objects: [{ left: 0, top: 0, width: 100, height: 100, start: 0, end: 1, effect: 'box' }],
};
const okResult = (dto: RenderRequestDto): RenderResultDto => ({
  slideId: dto.slideId,
  outputPath: dto.outputPath,
  durationSec: 12.3,
  renderMs: 100,
  warnings: [],
});

/**
 * ioredis 흉내. brpop 은 넣어둔 메시지를 순서대로 주고, 비면 잠깐 기다렸다 null(타임아웃).
 * disconnect 는 실제처럼 대기 중인 brpop 을 "Connection is closed" 로 거부한다.
 */
function fakeRedis(inputs: string[]) {
  const outputs: OutputMessage[] = [];
  let pendingReject: ((err: Error) => void) | undefined;
  const blocking = {
    status: 'ready',
    brpop: vi.fn(async (): Promise<[string, string] | null> => {
      const next = inputs.shift();
      if (next !== undefined) return ['render:input', next];
      return new Promise((resolve, reject) => {
        pendingReject = reject;
        setTimeout(() => {
          pendingReject = undefined;
          resolve(null);
        }, 20);
      });
    }),
    disconnect: vi.fn(() => pendingReject?.(new Error('Connection is closed.'))),
  };
  const redis = {
    status: 'ready',
    lpush: vi.fn(async (_key: string, payload: string) => outputs.push(JSON.parse(payload))),
    quit: vi.fn(async () => 'OK'),
  };
  return { blocking, redis, outputs };
}

function start(inputs: string[], render: (dto: RenderRequestDto, jobId: string) => Promise<RenderResultDto>) {
  const { blocking, redis, outputs } = fakeRedis(inputs);
  const renderer = { render: vi.fn(render) };
  const consumer = new RenderConsumer(
    blocking as unknown as Redis,
    redis as unknown as Redis,
    renderer as unknown as RenderService,
    new PinoLogger({ pinoHttp: { level: 'silent' } }),
  );
  consumer.onApplicationBootstrap();
  return { consumer, renderer, blocking, redis, outputs };
}

describe('RenderConsumer', () => {
  it('정상 메시지 → render(dto, jobId) 호출 후 status=ok 결과를 출력 큐에 넣는다', async () => {
    const { consumer, renderer, outputs, redis } = start([JSON.stringify(request)], async (dto) => okResult(dto));
    await vi.waitFor(() => expect(outputs).toHaveLength(1));
    await consumer.onApplicationShutdown('SIGTERM');

    const [dto, jobId] = renderer.render.mock.calls[0];
    expect(dto).toBeInstanceOf(RenderRequestDto);
    expect(jobId).toMatch(UUID);
    expect(outputs[0]).toMatchObject({ jobId, status: 'ok', slideId: 's1', outputPath: '/out/s1.mp4', durationSec: 12.3, renderMs: 100 });
    expect(consumer.status()).toMatchObject({ draining: true, current: null });
    expect(redis.quit).toHaveBeenCalled();
  });

  it('입력 1건마다 출력 1건: JSON 아님 / 스키마 위반 / 렌더 실패 / 정상 순서 그대로', async () => {
    const inputs = [
      '{not json',
      JSON.stringify({ ...request, audio: undefined, objects: [{ ...request.objects[0], effect: 'nope' }] }),
      JSON.stringify({ ...request, slideId: 'fails' }),
      JSON.stringify(request),
    ];
    const { consumer, renderer, outputs } = start(inputs, async (dto) => {
      if (dto.slideId === 'fails') throw new AppException(ErrorCode.INPUT_NOT_READABLE, { message: 'no such file' });
      return okResult(dto);
    });
    await vi.waitFor(() => expect(outputs).toHaveLength(4));
    await consumer.onApplicationShutdown();

    expect(outputs.map((o) => o.status)).toEqual(['error', 'error', 'error', 'ok']);
    expect(outputs[0]).toMatchObject({ status: 'error', error: { code: 'VALIDATION_FAILED', message: 'message is not valid JSON' } });
    expect(outputs[1]).toMatchObject({ status: 'error', slideId: 's1', error: { code: 'VALIDATION_FAILED' } });
    const message = (outputs[1] as { error: { message: string } }).error.message;
    expect(message).toContain('audio');
    expect(message).toContain('effect');
    expect(outputs[2]).toMatchObject({ status: 'error', slideId: 'fails', error: { code: 'INPUT_NOT_READABLE', message: 'no such file' } });
    expect(renderer.render).toHaveBeenCalledTimes(2); // 검증에서 걸린 2건은 렌더까지 가지 않는다
    for (const o of outputs) expect(o.jobId).toMatch(UUID);
  });

  it('AppException 이 아닌 에러는 RENDER_FAILED 로 감싼다', async () => {
    const { consumer, outputs } = start([JSON.stringify(request)], async () => {
      throw new Error('chrome crashed');
    });
    await vi.waitFor(() => expect(outputs).toHaveLength(1));
    await consumer.onApplicationShutdown();
    expect(outputs[0]).toMatchObject({ status: 'error', slideId: 's1', error: { code: 'RENDER_FAILED', message: 'chrome crashed' } });
  });

  it('drain: 진행 중 렌더는 끝까지 가고 결과가 나가며, 새 작업은 더 꺼내지 않는다', async () => {
    let finish!: (r: RenderResultDto) => void;
    const inFlight = new Promise<RenderResultDto>((resolve) => (finish = resolve));
    const { consumer, blocking, outputs } = start([JSON.stringify(request), JSON.stringify({ ...request, slideId: 'never' })], () => inFlight);
    await vi.waitFor(() => expect(consumer.status().current).not.toBeNull());

    const status = consumer.drain();
    expect(status).toMatchObject({ draining: true, current: { slideId: 's1' } });
    expect(status.current?.jobId).toMatch(UUID);
    expect(blocking.disconnect).toHaveBeenCalledTimes(1);
    expect(outputs).toHaveLength(0);

    finish(okResult(Object.assign(new RenderRequestDto(), request)));
    await consumer.onApplicationShutdown('SIGTERM');
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ status: 'ok', slideId: 's1' });
    expect(blocking.brpop).toHaveBeenCalledTimes(1); // 두 번째 메시지('never')는 꺼내지 않았다
    expect(consumer.status().current).toBeNull();
  });
});
