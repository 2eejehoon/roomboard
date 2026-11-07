import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // PLAYWRIGHT_CHROMIUM_PATH: use a pre-installed Chromium (cloud sessions); CI installs the pinned one instead.
  use: { baseURL: 'http://localhost:5173', trace: 'off', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // seedroom01 for the room tests (US1 runs before rooms can be created, T014).
  webServer: { command: 'npm run seed:dev && npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
