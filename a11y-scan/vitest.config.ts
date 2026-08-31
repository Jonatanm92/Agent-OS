import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser-backed tests launch Chromium and crawl a local fixture server;
    // 60s keeps them honest without being flaky on a cold browser start.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Fixture servers bind real ports, so files must not race each other.
    fileParallelism: false,
  },
});
