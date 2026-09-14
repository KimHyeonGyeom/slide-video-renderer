import { Module } from '@nestjs/common';
import { RenderModule } from '../render/render.module.js';
import { QueueController } from './queue.controller.js';
import { RedisModule } from './redis.module.js';
import { RenderConsumer } from './render.consumer.js';

/** Redis 큐와의 접점 전부: 연결, 소비 루프, drain 엔드포인트 */
@Module({
  imports: [RedisModule, RenderModule],
  controllers: [QueueController],
  providers: [RenderConsumer],
  exports: [RenderConsumer], // health 가 상태를 읽는다
})
export class QueueModule {}
