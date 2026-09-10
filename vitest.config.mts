import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest 공식 SWC 레시피의 Vitest 설정. SWC 가 데코레이터 메타데이터(emitDecoratorMetadata)를 만들어 DI 가 동작한다.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    testTimeout: 20_000,
    // ConfigModule.forRoot() 는 AppModule 을 import 하는 순간 env 를 읽으므로 테스트 env 는 여기서 정한다
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
