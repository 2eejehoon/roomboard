import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One test at a time: software WebGL uses every core, and a second 3D test would starve the local Worker under the others.
  workers: 1,
  // PLAYWRIGHT_CHROMIUM_PATH: use a pre-installed Chromium (cloud sessions); CI installs the pinned one instead.
  // SwiftShader gives headless Chromium WebGL for the 3D room; newer Chromium no longer falls back to it on its own.
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // seedroom01 for the room tests (US1 runs before rooms can be created, T014).
  webServer: { command: 'npm run seed:dev && npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
