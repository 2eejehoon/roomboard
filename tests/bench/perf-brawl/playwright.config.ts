import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config.ts';

// T056: a measurement run, not part of the per-PR E2E (tests/e2e). Software WebGL in a container or CI draws a phone frame in
// about 134 ms with nobody else in the room, so it cannot judge SC-002's 0.1 s; the number is recorded, a real phone judges (T060).
// npx playwright test -c tests/bench/perf-brawl --project mobile --trace off
export default defineConfig({ ...base, testDir: '.', webServer: { ...base.webServer!, cwd: resolve(import.meta.dirname, '../../..') } });
