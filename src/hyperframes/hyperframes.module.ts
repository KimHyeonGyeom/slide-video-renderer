import { Module } from '@nestjs/common';
import { CompositionBuilder } from './composition.builder.js';
import { HyperframesService } from './hyperframes.service.js';

/** HyperFrames 를 아는 유일한 모듈. 밖에서는 "컴포지션 만들기"와 "mp4 렌더" 두 기능만 쓴다. */
@Module({
  providers: [CompositionBuilder, HyperframesService],
  exports: [CompositionBuilder, HyperframesService],
})
export class HyperframesModule {}
