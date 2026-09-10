import { Module } from '@nestjs/common';
import { HyperframesModule } from '../hyperframes/hyperframes.module.js';
import { RenderQueueService } from './render-queue.service.js';
import { RenderWorkspaceService } from './render-workspace.service.js';
import { RenderController } from './render.controller.js';
import { RenderService } from './render.service.js';

@Module({
  imports: [HyperframesModule],
  controllers: [RenderController],
  providers: [RenderService, RenderWorkspaceService, RenderQueueService],
  exports: [RenderQueueService], // health 가 큐 상태를 읽는다
})
export class RenderModule {}
