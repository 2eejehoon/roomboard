import { expect } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, newPage, state, test, withoutWebGL } from './helpers.ts';

// quickstart Q1~Q3 (US1).
// Q1/Q2 time the sync path, so they run without the 3D scene: software WebGL on the CI machine starves the local Worker
// (a move took 1.4~1.6 s to leave the server while two SwiftShader pages rendered). The 3D send path is the next test.
test('Q1: a move reaches the other participant within a second; Q2: leaving removes them', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect(a.locator('header').getByText(me.nickname), 'my random nickname is shown').toBeVisible();
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
  // 30 s like enter(): both pages load software-rendered 3D at once, and B's page can answer slowly (CI runs 42603349133, 42604847932).
  await expect.poll(async () => (await state(b)).peers.find((p) => p.peerId === me.peerId)?.p, { timeout: 30_000 }).toEqual([0, 0, 4]);

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

// T046: a remote avatar glides from its last pose to the new one instead of jumping. The nickname label follows it every frame.
test('T046: a remote avatar moves through the poses in between', async ({ browser }) => {
  test.setTimeout(90_000);
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
  // Each try moves 2 m (over a second, under 8 m/s) and samples the label with frame times. A glide is only visible when a frame
  // lands inside its 200 ms; CI's software WebGL sometimes stalls through it (runs 42603349133, 42609456809), so such a try is
  // repeated, as T045 repeats its input. A label that jumps although frames did land in the glide fails every try.
  let at = 1;
  // A jump with frames inside the glide is a real failure, so it ends the retries and fails below instead of being retried away.
  let jumped: string | undefined;
  await expect(async () => {
    await b.waitForTimeout(1000);
    const target = (at = at === 1 ? 3 : 1);
    await a.evaluate((name) => {
      const el = [...document.querySelectorAll('span')].find((s) => s.textContent === name)!;
      const w = window as unknown as { xs: [number, number][] };
      w.xs = [];
      const t0 = performance.now();
      const sample = () => {
        w.xs.push([performance.now(), Math.round(el.getBoundingClientRect().x)]);
        if (performance.now() - t0 < 3000) requestAnimationFrame(sample);
      };
      sample();
    }, peer.nickname);
    await moveB([target, 0, 4]);
    await a.waitForTimeout(3200);
    const seen = await a.evaluate(() => (window as unknown as { xs: [number, number][] }).xs);
    const xs = seen.map(([, x]) => x);
    const [first, last] = [xs[0]!, xs.at(-1)!];
    expect(Math.abs(last - first), 'the avatar moved on screen').toBeGreaterThan(20);
    const between = (x: number) => Math.min(first, last) + 5 < x && x < Math.max(first, last) - 5;
    if (xs.some(between)) return;
    // No frame showed a position in between: every frame sat within 5 px of the start or the end. Take the first frame at the end and
    // the one before it, still near the start. A 200 ms linear glide needs at least 200 × (1 − 10/D) ms to cross between them, so a
    // shorter gap is a real jump; a longer one may have hidden a working glide (CI's software WebGL stalls), so retry (PR #41 review).
    const end = xs.findIndex((x) => Math.abs(x - last) <= 5);
    const gap = seen[end]![0] - seen[end - 1]![0];
    const certain = 200 * (1 - 10 / Math.abs(last - first));
    expect(gap < certain, `frame gap of ${Math.round(gap)} ms may have hidden the glide, retrying: ${xs.join(',')}`).toBe(true);
    jumped = xs.join(',');
  }).toPass({ timeout: 40_000 });
  expect(jumped, 'positions in between (frames landed inside the glide, yet the label jumped)').toBeUndefined();
});

// The label is placed from the avatar's world matrix inside its own frame callback. If that callback runs before the one that
// moves the avatar, the label shows last frame's position, and after one long frame it jumps although the glide works (CI).
test('T046: right after a long frame the label is already where the avatar is', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await newPage(browser, { viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  const peer = await enter(b);
  const label = a.getByText(peer.nickname, { exact: true });
  await expect(label).toBeVisible({ timeout: 30_000 });
  const moveB = (p: number[]) => b.evaluate((p) => (window as unknown as { __roomboard: { move(p: number[], r: number): void } }).__roomboard.move(p, 0), p);
  await b.waitForTimeout(500);
  await moveB([1, 0, 4]);
  await expect.poll(async () => (await state(a)).peers.find((p) => p.peerId === peer.peerId)?.p).toEqual([1, 0, 4]);
  await a.waitForTimeout(1000);
  const startX = await label.evaluate((el) => Math.round(el.getBoundingClientRect().x));

  // As soon as the store has the new pose, hold the main thread for 300 ms (longer than the 200 ms glide), then read the label on
  // the next frame. The avatar is at the end by then, so the label must be too.
  const done = a.evaluate(
    ({ name, peerId }) =>
      new Promise<number>((resolve) => {
        const el = [...document.querySelectorAll('span')].find((s) => s.textContent === name)!;
        const hooks = (window as unknown as { __roomboard: { state(): { peers: { peerId: string; p: number[] }[] } } }).__roomboard;
        const watch = () => {
          if (hooks.state().peers.find((p) => p.peerId === peerId)?.p[0] !== 3) return requestAnimationFrame(watch);
          // One frame for React to commit the pose and start the glide, then the long frame.
          requestAnimationFrame(() => {
            const t = performance.now();
            while (performance.now() - t < 300);
            requestAnimationFrame(() => resolve(Math.round(el.getBoundingClientRect().x)));
          });
        };
        watch();
      }),
    { name: peer.nickname, peerId: peer.peerId },
  );
  await b.waitForTimeout(1000);
  await moveB([3, 0, 4]);
  const afterStall = await done;
  await a.waitForTimeout(1000);
  const endX = await label.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  expect(Math.abs(endX - startX), 'the avatar moved on screen').toBeGreaterThan(20);
  expect(Math.abs(afterStall - endX), `label after the long frame at ${afterStall}, start ${startX}, end ${endX}`).toBeLessThanOrEqual(5);
});
