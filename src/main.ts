import 'dotenv/config'; // .env 를 process.env 로 (없으면 그냥 넘어간다). 다른 import 보다 먼저여야 한다
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

const PORT = Number(process.env.PORT) || 8080;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger)); // Nest 내부 로그도 pino 로

  // SIGTERM: RenderConsumer 가 새 작업을 멈추고 진행 중 작업을 끝낸 뒤 종료한다.
  // 단, 렌더 도중 SIGTERM 이 오면 puppeteer 가 Chrome 을 닫아 그 작업은 실패한다 → k8s 는 preStop 에서 /drain 후 기다린다 (DESIGN.md §9)
  app.enableShutdownHooks();

  // HTTP 는 /health 와 /drain 뿐. 작업은 Redis 입력 큐에서 가져간다 (RenderConsumer)
  await app.listen(PORT);
  app.get(Logger).log(`worker up, health on :${PORT}`, 'bootstrap');
}

bootstrap();
