import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest 공식 SWC 레시피의 Vitest 설정. SWC 가 데코레이터 메타데이터(emitDecoratorMetadata)를 만들어 DI 가 동작한다.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    testTimeout: 20_000,
    // 서비스들이 모듈 로드 시점에 process.env 를 읽으므로 테스트 env 는 여기서 정한다
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
