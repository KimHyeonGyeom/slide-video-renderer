#!/usr/bin/env node
// 스모크 테스트: HTTP 없이 Nest 컨텍스트를 띄워 RenderService.render() 를 그대로 실행한다.
// 사용:  npm run build && node scripts/smoke.mjs [request.json]   (기본 fixtures/sample/request.json, 없으면 생성)
// 실패하면 work/<jobId> 가 남는다 → node scripts/debug-page.mjs work/<jobId>/index.html 로 페이지를 진단.
import 'dotenv/config'; // .env → process.env (서비스들이 모듈 로드 시점에 읽으므로 가장 먼저)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../dist/app.module.js';
import { RenderService } from '../dist/render/render.service.js';

const reqPath = process.argv[2] ?? 'fixtures/sample/request.json';
if (!existsSync(reqPath) && reqPath === 'fixtures/sample/request.json') {
  execFileSync(process.execPath, ['scripts/make-fixture.mjs', 'fixtures/sample'], { stdio: 'inherit' });
}
const dto = JSON.parse(await readFile(reqPath, 'utf8'));

const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
try {
  const t0 = Date.now();
  const result = await app.get(RenderService).render(dto);
  console.log(JSON.stringify({ ...result, wallMs: Date.now() - t0 }, null, 2));
} finally {
  await app.close();
}
