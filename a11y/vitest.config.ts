import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The end-to-end test drives a real browser against local fixture shops.
    testTimeout: 180_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
