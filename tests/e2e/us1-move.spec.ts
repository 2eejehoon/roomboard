import { expect, test, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';

// quickstart Q1~Q3 (US1). seedroom01 comes from npm run seed:dev.
type HookState = { you: { peerId: string; nickname: string } | null; peers: { peerId: string; p: number[]; a: string }[]; connection: string };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __roomboard: { state(): HookState } }).__roomboard.state());

async function enter(page: Page) {
  await page.goto('/rooms/seedroom01');
  await expect.poll(async () => (await page.evaluate(() => '__roomboard' in window)) && (await state(page)).connection).toBe('open');
  return (await state(page)).you!;
}

test('Q1: a move reaches the other participant within a second; Q2: leaving removes them', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
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
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const me = await enter(a);
  await enter(b);
  await expect(a.locator('canvas')).toBeVisible();
  const joystick = a.getByRole('group', { name: ko['room3d.joystick'] });
  await expect.poll(async () => (await state(b)).peers.find((p) => p.peerId === me.peerId)?.p).toEqual([0, 0, 4]);

  if (isMobile) {
    await expect(joystick).toBeVisible();
    const box = (await joystick.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await a.mouse.move(x, y);
    await a.mouse.down();
    await a.mouse.move(x, y - 40, { steps: 5 });
    await a.waitForTimeout(800);
    await a.mouse.up();
  } else {
    await expect(joystick).toHaveCount(0);
    await a.keyboard.down('KeyW');
    await a.waitForTimeout(800);
    await a.keyboard.up('KeyW');
  }
  const seen = () => state(b).then((s) => s.peers.find((p) => p.peerId === me.peerId));
  await expect.poll(async () => (await seen())?.p).not.toEqual([0, 0, 4]);
  await expect.poll(async () => (await seen())?.a, { message: 'stopping sends one idle' }).toBe('idle');
});

// WebGL detection and the 2D screen are US2 (T053, T056); until then a failed 3D scene must not take the room down.
test('without WebGL the room still connects and shows the header', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await a.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id.startsWith('webgl') ? null : getContext.call(this, id as '2d', ...(rest as []));
    } as typeof getContext;
  });
  const me = await enter(a);
  await expect(a.getByText(me.nickname)).toBeVisible();
});
