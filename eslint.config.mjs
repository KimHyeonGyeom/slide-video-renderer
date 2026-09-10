// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'work/**', 'fixtures/**', 'src/hyperframes/effects/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // consistent-type-imports 는 켜지 않는다: DI 가 emitDecoratorMetadata 로 생성자 파라미터 타입을 값으로 참조하므로
      // `import type` 로 바꾸면 "can't resolve dependencies" 가 난다.
    },
  },
);
