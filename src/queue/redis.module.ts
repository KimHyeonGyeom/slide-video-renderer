import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';

/** 일반용 연결 (LPUSH, 상태 확인) */
export const REDIS = 'REDIS';
/** BRPOP 전용 연결. 블로킹 명령은 연결을 독점하므로 다른 명령과 나눠 쓰지 않는다 */
export const REDIS_BLOCKING = 'REDIS_BLOCKING';

const SENTINELS = (process.env.REDIS_SENTINELS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MASTER_NAME = process.env.REDIS_MASTER_NAME || 'mymaster';

/**
 * 센티널로만 붙는다: 센티널에 마스터 주소를 물어 연결하고, 페일오버 때는 ioredis 가 새 마스터로 다시 붙는다.
 * REDIS_PASSWORD 는 마스터(requirepass)용. 센티널 자체엔 인증을 걸지 않는 전제라 센티널에는 평문으로 붙는다.
 * 로컬은 docker compose 의 redis + sentinel 로 같은 경로를 탄다 (README).
 */
export function createRedis(): Redis {
  if (SENTINELS.length === 0) {
    throw new Error('REDIS_SENTINELS is required, e.g. "host1:26379,host2:26379,host3:26379"');
  }
  return new Redis({
    sentinels: SENTINELS.map((s) => {
      const [host, port] = s.split(':');
      return { host, port: Number(port) || 26379 };
    }),
    name: MASTER_NAME,
    role: 'master',
    password: process.env.REDIS_PASSWORD || undefined,
    // 재접속 중인 명령은 실패시키지 않고 다시 붙을 때까지 기다린다 (페일오버 몇 초를 넘기기 위해)
    maxRetriesPerRequest: null,
  });
}

@Module({
  providers: [
    { provide: REDIS, useFactory: createRedis },
    { provide: REDIS_BLOCKING, useFactory: createRedis },
  ],
  exports: [REDIS, REDIS_BLOCKING],
})
export class RedisModule {}
