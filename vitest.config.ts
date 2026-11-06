import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', environment: 'node', include: ['tests/core/**/*.test.ts', 'tests/scripts/**/*.test.ts'] } },
    ],
  },
});
