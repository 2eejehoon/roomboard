import { expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { THEME_IDS, THEMES, type ThemeId } from '../../../src/core/themes.ts';
import { createRoom, enter, move, newPage, state, test } from '../../e2e/helpers.ts';

// 007 research R1: what each fixed view costs the GPU, counted from the page's own WebGL calls (no app hook, so a production
// build measures the same way): draw calls and triangles per frame, split into the main pass (default framebuffer) and the
// shadow pass (any other framebuffer), and texture memory uploaded. These do not depend on the GPU, so software WebGL gives the
// real numbers. Frame times under software WebGL do not judge a phone; they are recorded to compare against this run's baseline.
// Views: each theme's spawn view and the arena start view; then the cafe arena with 19 clients standing, then placing and breaking blocks.
type Stats = { mainDraws: number; shadowDraws: number; mainTris: number; shadowTris: number; textures: number; textureMB: number; frameP50: number; frameP95: number; longTaskMs: number };
type Probe = { __scene: { sample(ms: number): Promise<Stats> } };

function probe() {
  const gl = WebGL2RenderingContext.prototype;
  let offscreen = false;
  const frame = { mainDraws: 0, shadowDraws: 0, mainTris: 0, shadowTris: 0 };
  const draw = (count: number, instances = 1) => {
    const tris = Math.floor(count / 3) * instances;
    if (offscreen) [frame.shadowDraws, frame.shadowTris] = [frame.shadowDraws + 1, frame.shadowTris + tris];
    else [frame.mainDraws, frame.mainTris] = [frame.mainDraws + 1, frame.mainTris + tris];
  };
  const wrap = <K extends keyof WebGL2RenderingContext>(name: K, before: (...a: number[]) => void) => {
    const f = gl[name] as (...a: unknown[]) => unknown;
    (gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
      before(...(a as number[]));
      return f.apply(this, a);
    };
  };
  wrap('bindFramebuffer', (_t, fb) => void (offscreen = fb !== null));
  wrap('drawElements', (_m, count) => draw(count));
  wrap('drawArrays', (_m, _first, count) => draw(count));
  wrap('drawElementsInstanced', (_m, count, _t, _o, n) => draw(count, n));
  wrap('drawArraysInstanced', (_m, _first, count, n) => draw(count, n));
  // Texture memory: RGBA8 assumed (4 bytes a texel, mip chains ignored); a compressed upload counts its own byte length.
  const textures = new Map<WebGLTexture, number>();
  let bound: WebGLTexture | null = null;
  wrap('bindTexture', (_t, tex) => void (bound = tex as unknown as WebGLTexture | null));
  wrap('deleteTexture', (tex) => void textures.delete(tex as unknown as WebGLTexture));
  const size = (bytes: number, level: number) => bound && level === 0 && textures.set(bound, Math.max(textures.get(bound) ?? 0, bytes));
  wrap('texImage2D', (...a: unknown[]) => {
    const [level, w, h] = [a[1] as number, ...(a.length >= 8 ? [a[3], a[4]] : [(a[5] as { width?: number })?.width, (a[5] as { height?: number })?.height])] as number[];
    size((w ?? 0) * (h ?? 0) * 4, level);
  });
  wrap('texStorage2D', (_t, _levels, _f, w, h) => size(w * h * 4, 0));
  wrap('compressedTexImage2D', (...a: unknown[]) => size((a.at(-1) as ArrayBufferView)?.byteLength ?? 0, a[1] as number));

  const longTasks: number[] = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ type: 'longtask' });
  const pct = (a: number[], q: number) => a.toSorted((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0;
  (window as unknown as Probe).__scene = {
    sample: (ms) =>
      new Promise((resolve) => {
        const frames: (typeof frame & { at: number })[] = [];
        const lt0 = longTasks.length;
        const end = performance.now() + ms;
        const tick = (at: number) => {
          frames.push({ ...frame, at });
          Object.assign(frame, { mainDraws: 0, shadowDraws: 0, mainTris: 0, shadowTris: 0 });
          if (at < end) return requestAnimationFrame(tick);
          const counted = frames.slice(1); // the first holds draws from before the window
          const median = (k: keyof typeof frame) => pct(counted.map((f) => f[k]), 0.5);
          const gaps = counted.map((f, i) => f.at - frames[i]!.at);
          resolve({
            mainDraws: median('mainDraws'), shadowDraws: median('shadowDraws'), mainTris: median('mainTris'), shadowTris: median('shadowTris'),
            textures: textures.size, textureMB: +([...textures.values()].reduce((s, b) => s + b, 0) / 2 ** 20).toFixed(2),
            frameP50: +pct(gaps, 0.5).toFixed(1), frameP95: +pct(gaps, 0.95).toFixed(1),
            longTaskMs: Math.round(longTasks.slice(lt0).reduce((s, d) => s + d, 0)),
          });
        };
        requestAnimationFrame(tick);
      }),
  };
}

const sample = (page: Page, ms = 4000) => page.evaluate((ms) => (window as unknown as Probe).__scene.sample(ms), ms);

// Hook moves 0.5 m apart, under the 8 m/s check (as perf-brawl).
async function walk(page: Page, to: number[]) {
  const from = (await state(page)).you!.p;
  const n = Math.ceil(Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!) / 0.5);
  for (let i = 1; i <= n; i++) {
    await move(page, from.map((v, k) => v + ((to[k]! - v) * i) / n));
    await page.waitForTimeout(100);
  }
}

let fakes: ChildProcess | undefined;
test.afterEach(() => void fakes?.kill());

test('007 R1: scene cost per view', async ({ browser }, info) => {
  test.setTimeout(900_000);
  const rows: Record<string, Stats> = {};
  for (const themeId of THEME_IDS as readonly ThemeId[]) {
    const page = await newPage(browser);
    await page.addInitScript(probe);
    const roomId = await createRoom(page, `007 R1 ${themeId}`, 'owner-pass', themeId);
    await enter(page, `/rooms/${roomId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // models in, camera settled
    rows[`${themeId} spawn`] = await sample(page);

    const e = THEMES[themeId].arenaEntrance;
    // One hook move, as perf-brawl: the spawn sample's 7 s since joining covers the 8 m/s check for any theme's distance.
    await move(page, [e[0] + 0.5, 0, e[2] + 0.5]);
    await expect.poll(async () => (await state(page)).you!.p[0], { timeout: 15_000 }).toBeGreaterThan(20);
    await page.waitForTimeout(2000);
    rows[`${themeId} arena`] = await sample(page);

    if (themeId === 'cafe') {
      // Out of the fake clients' grid (x 26~38, z 4~13). First 19 standing (rate 0.01/s: no block in the window), the control
      // for drawing 19 avatars; then 19 each changing a block 4 times a second: the difference is the arena rebuild.
      await walk(page, [40.5, 1, 20.5]);
      const base = new URL(page.url()).origin;
      for (const [name, rate] of [['cafe arena, 19 standing', '0.01'], ['cafe arena, 19 building', '4']] as const) {
        // 17 s: real.mjs measures from 3 s after its clients joined, so its summary covers this page's 10 s sample (6 s in).
        fakes = spawn('node', ['tests/bench/brawl-load/real.mjs', base, roomId, '19', '17', rate], { env: { ...process.env, SPREAD: '1', BUILD: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        fakes.stdout!.on('data', (d: Buffer) => (out += d));
        const exited = new Promise((r) => fakes!.once('exit', r));
        await expect.poll(async () => (await state(page)).peers.length, { timeout: 30_000 }).toBe(19);
        await page.waitForTimeout(6000); // their walk to the grid and warmup
        rows[name] = await sample(page, 10_000);
        await exited;
        // The block changes each client received a second: 19 × 4 when every place and break lands.
        console.log(`${name}: real.mjs ${out.trim()}`);
        await expect.poll(async () => (await state(page)).peers.length, { timeout: 30_000 }).toBe(0);
      }
    }
    await page.context().close();
  }
  console.table(rows);
  console.log(`007 R1 ${info.project.name} ${JSON.stringify(rows)}`);
  expect(Object.values(rows).every((r) => r.mainDraws > 0)).toBe(true);
});
