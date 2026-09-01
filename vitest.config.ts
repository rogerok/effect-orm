import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    setupFiles: ['./src/config/result-matchers.ts'],
  },
});
