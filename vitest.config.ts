import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['tests/core/**/*.test.ts', 'tests/scripts/**/*.test.ts', 'tests/client/**/*.test.{ts,tsx}'],
        },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations } } })],
        test: { name: 'worker', include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/apply-migrations.ts'] },
      },
    ],
  },
});
