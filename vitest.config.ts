import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', environment: 'node', include: ['tests/core/**/*.test.ts', 'tests/scripts/**/*.test.ts'] } },
      { plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })], test: { name: 'worker', include: ['tests/worker/**/*.test.ts'] } },
    ],
  },
});
