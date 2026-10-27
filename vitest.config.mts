import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
      reporter: ['text'],
      // M3 definition of done: every money and comparison branch is covered.
      thresholds: {
        'src/shared/money.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/comparison/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
        'src/shared/validation/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
