import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { RenderQueueService } from '../render/render-queue.service.js';

/** liveness / readiness 프로브. Spring Actuator 의 /actuator/health 에 해당. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly queue: RenderQueueService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.indicator.check('renderQueue').up(this.queue.stats())]);
  }
}
