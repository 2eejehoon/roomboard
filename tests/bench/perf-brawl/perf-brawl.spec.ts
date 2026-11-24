import { expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRoom, enter, move, newPage, state, test } from '../../e2e/helpers.ts';

// T056, SC-002 (SC-006): on a phone on Fast 4G (precedent 2026-11-09-perf-4g) fighting among 19 others (T054's fake clients, spread
// out so every move and swing reaches this page), the jab key → the swing flash on my own 3D screen within 0.1 s, p95 of 20+ presses.
// The flash is shown before the server answers (FR-032), so this measures the page's own frame and message handling.
const FAST_4G = { offline: false, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9, latency: 60 * 2.75 };
const PRESSES = 24;
const FAKES = Number(process.env.T056_FAKES ?? 19); // 0 for the baseline: the page's own frame cost
type Hooks = { __roomboard: { swingsShown(): number[] } };

test.skip(({ isMobile }) => !isMobile, 'SC-002 is defined for phones; the mobile project runs it');

let fakes: ChildProcess | undefined;
test.afterEach(() => void fakes?.kill());

// Hook moves 0.5 m apart, under the 8 m/s check.
async function walk(page: Page, to: [number, number, number]) {
  const from = (await state(page)).you!.p;
  const n = Math.ceil(Math.hypot(to[0] - from[0]!, to[2] - from[2]!) / 0.5);
  for (let i = 1; i <= n; i++) {
    await move(page, from.map((v, k) => v + ((to[k]! - v) * i) / n));
    await page.waitForTimeout(100);
  }
}

test('SC-002: jab → my swing flash within 0.1 s (p95) on Fast 4G among 19 fighters', async ({ browser }) => {
  test.setTimeout(420_000); // under software WebGL with 19 avatars a phone frame is slow
  const page = await newPage(browser);
  const roomId = await createRoom(page, 'T056 측정');
  await enter(page, `/rooms/${roomId}`);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  // Throttled once loaded: the dev server's unbundled modules are not what a phone downloads (perf.spec measures loading).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await page.waitForTimeout(1500);
  await move(page, [5.5, 0, 2.5]);
  await expect.poll(async () => (await state(page)).you!.p[0]).toBeGreaterThan(20);
  // Away from the fake clients' grid (x 26~38, z 4~13), so nobody hits me and every press is a swing.
  await walk(page, [40.5, 1, 20.5]);

  // The page joined first, so the 19 fill the rest of its channel.
  const base = new URL(page.url()).origin;
  if (FAKES) fakes = spawn('node', ['tests/bench/brawl-load/real.mjs', base, roomId, String(FAKES), '400'], { env: { ...process.env, SPREAD: '1' }, stdio: 'inherit' });
  await expect.poll(async () => (await state(page)).peers.length, { timeout: 30_000 }).toBe(FAKES);
  await page.waitForTimeout(4000); // their walk to the grid

  await page.locator('canvas').click();
  // Pressed from inside the page: under software WebGL each Playwright call waits on the busy main thread. Held 300 ms (the scene
  // reads keys once per frame), 700 ms apart, past the jab's cooldown, so no press is held back (R2).
  const keys = await page.evaluate(async (n) => {
    const at: number[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < n; i++) {
      const down = new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', bubbles: true });
      at.push(down.timeStamp);
      document.dispatchEvent(down);
      await wait(300);
      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', key: 'j', bubbles: true }));
      await wait(400);
    }
    return at;
  }, PRESSES);
  const shown = await page.evaluate(() => (window as unknown as Hooks).__roomboard.swingsShown());
  // Each press's latency: the first flash after it.
  const ms = keys.map((k) => (shown.find((s) => s >= k) ?? Infinity) - k).toSorted((a, b) => a - b);
  const p95 = ms[Math.floor(ms.length * 0.95)]!;
  const frameMs = await page.evaluate(() => new Promise<number>((r) => {
    const t: number[] = [];
    const f = (x: number) => (t.push(x) < 30 ? requestAnimationFrame(f) : r((t[29]! - t[0]!) / 29));
    requestAnimationFrame(f);
  }));
  console.log(`T056 mean frame ${frameMs.toFixed(1)} ms, fake clients ${FAKES}`);
  console.log(`T056 jab → flash ms: p50 ${ms[Math.floor(ms.length / 2)]!.toFixed(1)} p95 ${p95.toFixed(1)} max ${ms.at(-1)!.toFixed(1)} (n=${ms.length})`);
  expect(ms.length).toBeGreaterThanOrEqual(20);
  expect(p95).toBeLessThanOrEqual(100);
});
