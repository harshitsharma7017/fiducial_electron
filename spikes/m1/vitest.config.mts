import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The PDF test launches Electron; give it room on a cold start.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
