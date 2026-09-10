import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import configuration from './config/configuration.js';
import { HealthModule } from './health/health.module.js';
import { RenderModule } from './render/render.module.js';

@Module({
  imports: [
    // 로컬은 .env, 운영은 Deployment env (이미 있는 env 가 .env 보다 우선)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', load: [configuration] }),
    // 로거: 운영은 JSON 한 줄(로그 수집기용), 로컬은 pino-pretty. HTTP 접근 로그 자동 기록 (/health 제외)
    LoggerModule.forRootAsync({
      inject: [configuration.KEY],
      useFactory: ({ app }: ConfigType<typeof configuration>) => ({
        pinoHttp: {
          level: app.logLevel,
          transport: app.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
          autoLogging: { ignore: (req: IncomingMessage) => req.url?.startsWith('/health') === true },
          // 요청 안의 로그 줄에는 reqId 만 붙인다 (헤더 등 req 전체가 매 줄에 반복되지 않게). "request completed" 줄은 그대로
          quietReqLogger: true,
        },
      }),
    }),
    HealthModule,
    RenderModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
