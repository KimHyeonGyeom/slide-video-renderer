import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RenderModule } from '../render/render.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, RenderModule],
  controllers: [HealthController],
})
export class HealthModule {}
