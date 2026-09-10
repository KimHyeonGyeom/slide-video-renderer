import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// 렌더 자체(10초+)는 여기서 돌리지 않는다 → scripts/api-test.sh
describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → ok + 렌더 큐 상태', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.renderQueue).toMatchObject({ status: 'up', rendering: 0, queued: 0 });
  });

  it('POST /render 빈 본문 → 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer()).post('/render').send({}).expect(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('slideImage')]));
  });

  it('POST /render 없는 입력 파일 → 400 INPUT_NOT_READABLE + jobId', async () => {
    const res = await request(app.getHttpServer())
      .post('/render')
      .send({
        slideImage: '/nonexistent/slide.png',
        audio: '/nonexistent/audio.mp3',
        outputPath: '/tmp/out.mp4',
        objects: [{ left: 0, top: 0, width: 100, height: 100, start: 0, end: 1, effect: 'box' }],
      })
      .expect(400);
    expect(res.body.error).toBe('INPUT_NOT_READABLE');
    expect(res.body.jobId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
