import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { RenderConsumer } from '../queue/render.consumer.js';

/**
 * liveness / readiness 프로브. Redis 연결이 끊겨 있으면 503.
 * consumer 항목은 preStop 이 진행 중 작업(current)이 끝났는지 볼 때 쓴다. Spring Actuator 의 /actuator/health 에 해당.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly consumer: RenderConsumer,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const { redis, draining, current } = this.consumer.status();
    return this.health.check([
      () => (redis === 'ready' ? this.indicator.check('redis').up() : this.indicator.check('redis').down({ connection: redis })),
      () => this.indicator.check('consumer').up({ draining, current }),
    ]);
  }
}
