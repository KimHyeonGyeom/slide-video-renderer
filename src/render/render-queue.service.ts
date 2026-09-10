import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Semaphore } from '../common/utils/semaphore.util.js';
import configuration from '../config/configuration.js';

/** type alias 인 이유: terminus 의 up(data) 가 index signature 를 요구하는데 interface 는 그게 없다 */
export type QueueStats = {
  /** 지금 렌더 중인 수 */
  rendering: number;
  /** 슬롯을 기다리는 수 */
  queued: number;
};

/**
 * 파드당 렌더 수를 RENDERS_PER_POD 로 제한한다 (DESIGN.md §9).
 * 요청은 전부 접수하고 여기서 순서대로 기다린다. 기다리는 요청은 프로미스라 메모리를 거의 쓰지 않는다.
 * 쿠버네티스는 파드 수만 정할 수 있고 파드 안의 동시 실행 수는 못 막으므로, "파드 = 렌더 1개" 를 지키는 코드는 이것뿐이다.
 */
@Injectable()
export class RenderQueueService implements OnApplicationShutdown {
  private readonly semaphore: Semaphore;

  constructor(
    @Inject(configuration.KEY) config: ConfigType<typeof configuration>,
    @InjectPinoLogger(RenderQueueService.name) private readonly logger: PinoLogger,
  ) {
    this.semaphore = new Semaphore(config.render.rendersPerPod);
  }

  /** 슬롯을 얻는다. 반환된 함수로 반납한다. */
  acquire(): Promise<() => void> {
    return this.semaphore.acquire();
  }

  stats(): QueueStats {
    return { rendering: this.semaphore.active, queued: this.semaphore.waiting };
  }

  /** SIGTERM: Nest 가 HTTP 서버를 먼저 닫고(진행 중 요청은 완료) 이 훅을 부른다. 상태만 남긴다. */
  onApplicationShutdown(signal?: string): void {
    this.logger.info({ signal, ...this.stats() }, 'shutdown');
  }
}
