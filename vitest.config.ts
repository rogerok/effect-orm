import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    setupFiles: ['./src/config/result-matchers.ts'],
    // PGlite boots Postgres as WASM in every test that uses it: ~1.6 s on an
    // idle machine, several times longer when all workers start it at once.
    // The default 5 s limit then fails tests that are merely slow to start.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
