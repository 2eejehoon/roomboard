import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config.ts';

// 007 research R1: the scene budget's measurement run, not part of the per-PR E2E (like tests/bench/perf-brawl).
// npx playwright test -c tests/bench/perf-scene --project mobile --trace off
export default defineConfig({ ...base, testDir: '.', webServer: { ...base.webServer!, cwd: resolve(import.meta.dirname, '../../..') } });
