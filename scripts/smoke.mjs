#!/usr/bin/env node
// 스모크 테스트: Redis 없이 RenderModule 만 띄워 RenderService.render() 를 그대로 실행한다 (렌더 자체를 디버깅할 때).
// 사용:  npm run build && node scripts/smoke.mjs [request.json]   (기본 fixtures/sample/request.json, 없으면 생성)
// 실패하면 work/<jobId> 가 남는다 → node scripts/debug-page.mjs work/<jobId>/index.html 로 페이지를 진단.
import 'dotenv/config'; // .env → process.env (서비스들이 모듈 로드 시점에 읽으므로 가장 먼저)
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Logger, LoggerModule } from 'nestjs-pino';
import { RenderModule } from '../dist/render/render.module.js';
import { RenderService } from '../dist/render/render.service.js';

const reqPath = process.argv[2] ?? 'fixtures/sample/request.json';
if (!existsSync(reqPath) && reqPath === 'fixtures/sample/request.json') {
  execFileSync(process.execPath, ['scripts/make-fixture.mjs', 'fixtures/sample'], { stdio: 'inherit' });
}
const dto = JSON.parse(await readFile(reqPath, 'utf8'));

const logger = LoggerModule.forRoot({
  pinoHttp: { level: process.env.LOG_LEVEL || 'info', transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } } },
});
const SmokeModule = Module({ imports: [logger, RenderModule] })(class SmokeModule {});

const app = await NestFactory.createApplicationContext(SmokeModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
try {
  const t0 = Date.now();
  const result = await app.get(RenderService).render(dto, randomUUID());
  console.log(JSON.stringify({ ...result, wallMs: Date.now() - t0 }, null, 2));
} finally {
  await app.close();
}
