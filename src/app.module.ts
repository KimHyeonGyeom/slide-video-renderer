import { Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module.js';
import { QueueModule } from './queue/queue.module.js';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    // 로거: 운영은 JSON 한 줄(로그 수집기용), 로컬은 pino-pretty. HTTP 는 /health, /drain 뿐이라 접근 로그는 끈다
    LoggerModule.forRoot({
      pinoHttp: {
        level: LOG_LEVEL,
        transport: IS_PRODUCTION
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
        autoLogging: { ignore: (req: IncomingMessage) => req.url?.startsWith('/health') === true },
        quietReqLogger: true,
      },
    }),
    QueueModule,
    HealthModule,
  ],
})
export class AppModule {}
