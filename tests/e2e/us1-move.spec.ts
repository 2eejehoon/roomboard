import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';

// quickstart Q1~Q3 (US1). seedroom01 comes from npm run seed:dev.
type HookState = { you: { peerId: string; nickname: string } | null; peers: { peerId: string; p: number[]; a: string }[]; connection: string };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __roomboard: { state(): HookState } }).__roomboard.state());

// Contexts from browser.newContext() outlive the test; an earlier test's 3D pages would keep rendering and starve the next one.
const contexts: BrowserContext[] = [];
test.afterEach(() => Promise.all(contexts.splice(0).map((c) => c.close())));
async function newPage(browser: Browser, options?: BrowserContextOptions) {
  const context = await browser.newContext(options);
  contexts.push(context);
  return context.newPage();
}

// WebGL detection and the 2D screen are US2 (T053, T056); until then this is how a page runs without the 3D scene.
async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id.startsWith('webgl') ? null : getContext.call(this, id as '2d', ...(rest as []));
    } as typeof getContext;
  });
  return page;
}

async function enter(page: Page) {
  await page.goto('/rooms/seedroom01');
  // Generous: another context's software-rendered 3D scene can hold the CPU while this one connects.
  await expect
    .poll(async () => (await page.evaluate(() => '__roomboard' in window)) && (await state(page)).connection, { timeout: 15_000 })
    .toBe('open');
  return (await state(page)).you!;
}

// Q1/Q2 time the sync path, so they run without the 3D scene: software WebGL on the CI machine starves the local Worker
// (a move took 1.4~1.6 s to leave the server while two SwiftShader pages rendered). The 3D send path is the next test.
test('Q1: a move reaches the other participant within a second; Q2: leaving removes them', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect(a.getByText(me.nickname), 'my random nickname is shown').toBeVisible();
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(true);

  await a.waitForTimeout(300); // stay under 8 m/s from the spawn
  await a.evaluate(() => (window as unknown as { __roomboard: { move(p: number[], r: number): void } }).__roomboard.move([0.5, 0, 4], 1));
  await expect
    .poll(async () => (await state(b)).peers.find((p) => p.peerId === me.peerId)?.p, { timeout: 1000 })
    .toEqual([0.5, 0, 4]);

  await a.context().close();
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(false);
});

// T045 (keyboard on desktop) and Q3 (joystick on touch devices): my own input moves me, and the other participant sees it.
test('T045, Q3: my input in the 3D room moves me for the other participant', async ({ browser, isMobile }) => {
  test.setTimeout(60_000);
  const a = await newPage(browser);
  const b = await newPage(browser);
  const me = await enter(a);
  await enter(b);
  await expect(a.locator('canvas')).toBeVisible();
  const joystick = a.getByRole('group', { name: ko['room3d.joystick'] });
  await expect.poll(async () => (await state(b)).peers.find((p) => p.peerId === me.peerId)?.p).toEqual([0, 0, 4]);

  const seen = () => state(b).then((s) => s.peers.find((p) => p.peerId === me.peerId));
  // The canvas shows before the models and physics load; retry the input until my avatar exists and B sees it move.
  await expect(async () => {
    if (isMobile) {
      await expect(joystick).toBeVisible();
      const box = (await joystick.boundingBox())!;
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      await a.mouse.move(x, y);
      await a.mouse.down();
      await a.mouse.move(x, y - 40, { steps: 5 });
      await a.waitForTimeout(400);
      await a.mouse.up();
    } else {
      await expect(joystick).toHaveCount(0);
      await a.keyboard.down('KeyW');
      await a.waitForTimeout(400);
      await a.keyboard.up('KeyW');
    }
    await expect.poll(async () => (await seen())?.p, { timeout: 2000 }).not.toEqual([0, 0, 4]);
  }).toPass({ timeout: 30_000 });
  // ecctrl slows down over about a second, longer in software rendering's slow motion.
  await expect.poll(async () => (await seen())?.a, { message: 'stopping sends one idle', timeout: 15_000 }).toBe('idle');
});

// Until US2 switches to 2D (T056), a failed 3D scene must not take the room down.
test('without WebGL the room still connects and shows the header', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await expect(a.getByText(me.nickname)).toBeVisible();
});

// T046: a remote avatar glides from its last pose to the new one instead of jumping. The nickname label follows it every frame.
test('T046: a remote avatar moves through the poses in between', async ({ browser }) => {
  test.setTimeout(60_000);
  // Small and 1x so software WebGL draws frames well under the 200 ms glide; at full size it can skip it entirely.
  const a = await newPage(browser, { viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  const peer = await enter(b);
  const label = a.getByText(peer.nickname, { exact: true });
  await expect(label).toBeVisible({ timeout: 30_000 });

  const moveB = (p: number[]) => b.evaluate((p) => (window as unknown as { __roomboard: { move(p: number[], r: number): void } }).__roomboard.move(p, 0), p);
  // Warm-up move: the first walk clip costs a long frame, and a frame longer than the glide rightly jumps to the end.
  await b.waitForTimeout(500);
  await moveB([1, 0, 4]);
  await expect.poll(async () => (await state(a)).peers.find((p) => p.peerId === peer.peerId)?.p).toEqual([1, 0, 4]);
  await b.waitForTimeout(1000); // 2 m in over a second stays under 8 m/s
  // Start sampling before B moves, so the first sample is the old pose.
  await a.evaluate((name) => {
    const el = [...document.querySelectorAll('span')].find((s) => s.textContent === name)!;
    const xs: number[] = ((window as unknown as { xs: number[] }).xs = []);
    const t0 = performance.now();
    const sample = () => {
      xs.push(Math.round(el.getBoundingClientRect().x));
      if (performance.now() - t0 < 3000) requestAnimationFrame(sample);
    };
    sample();
  }, peer.nickname);
  await moveB([3, 0, 4]);
  await a.waitForTimeout(3200);
  const seen = await a.evaluate(() => (window as unknown as { xs: number[] }).xs);
  const [first, last] = [seen[0], seen.at(-1)!];
  expect(Math.abs(last - first), 'the avatar moved on screen').toBeGreaterThan(20);
  expect(seen.some((x) => Math.min(first, last) + 5 < x && x < Math.max(first, last) - 5), `positions in between: ${seen.join(',')}`).toBe(true);
});
