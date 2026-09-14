import { Module } from '@nestjs/common';
import { HyperframesModule } from '../hyperframes/hyperframes.module.js';
import { RenderWorkspaceService } from './render-workspace.service.js';
import { RenderService } from './render.service.js';

/** 렌더 파이프라인. 작업이 어디서 오는지(Redis)는 모른다 — QueueModule 이 호출한다 */
@Module({
  imports: [HyperframesModule],
  providers: [RenderService, RenderWorkspaceService],
  exports: [RenderService],
})
export class RenderModule {}
