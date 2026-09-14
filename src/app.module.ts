import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { HealthModule } from './health/health.module.js';
import { RenderModule } from './render/render.module.js';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // 로거: 운영은 JSON 한 줄(로그 수집기용), 로컬은 pino-pretty. HTTP 접근 로그 자동 기록 (/health 제외)
    LoggerModule.forRoot({
      pinoHttp: {
        level: LOG_LEVEL,
        transport: IS_PRODUCTION
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
        autoLogging: { ignore: (req: IncomingMessage) => req.url?.startsWith('/health') === true },
        // 요청 안의 로그 줄에는 reqId 만 붙인다 (헤더 등 req 전체가 매 줄에 반복되지 않게). "request completed" 줄은 그대로
        quietReqLogger: true,
      },
    }),
    HealthModule,
    RenderModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
