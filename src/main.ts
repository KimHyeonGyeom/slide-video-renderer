import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import configuration from './config/configuration.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger)); // Nest 내부 로그도 pino 로

  // DTO 검증: 모르는 필드는 버리고(whitelist), 타입을 DTO 클래스로 변환(transform)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const openapi = new DocumentBuilder()
    .setTitle('Slide Video Renderer')
    .setDescription('PPT 슬라이드 이미지 + 음성 + 객체 좌표(EMU) → 강조 효과가 들어간 mp4')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openapi));

  // 렌더는 대기 포함 수 분이 걸리는 동기 요청. Node 의 요청 타임아웃(기본 300초)을 끈다.
  const server = app.getHttpServer() as Server;
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  // SIGTERM: 새 연결을 받지 않고 진행 중 요청이 끝난 뒤 종료 (쿠버네티스 terminationGracePeriodSeconds 안에서)
  app.enableShutdownHooks();

  const { port } = app.get<ConfigType<typeof configuration>>(configuration.KEY).app;
  await app.listen(port);
  app.get(Logger).log(`listening on :${port}  (Swagger: /docs, health: /health)`, 'bootstrap');
}

bootstrap();
