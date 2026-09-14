import { Controller, Post } from '@nestjs/common';
import { RenderConsumer } from './render.consumer.js';

/**
 * k8s preStop 용. 새 작업을 그만 꺼내게 한 뒤 GET /health 의 consumer.current 가 null 이 될 때까지 기다리면
 * 진행 중이던 렌더를 잃지 않고 파드를 내릴 수 있다 (DESIGN.md §9).
 */
@Controller('drain')
export class QueueController {
  constructor(private readonly consumer: RenderConsumer) {}

  @Post()
  drain() {
    return this.consumer.drain();
  }
}
