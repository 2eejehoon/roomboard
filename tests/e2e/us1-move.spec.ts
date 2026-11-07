import { expect, test, type Page } from '@playwright/test';

// quickstart Q1, Q2 (US1). Q3 (joystick) arrives with the 3D scene. seedroom01 comes from npm run seed:dev.
type HookState = { you: { peerId: string; nickname: string } | null; peers: { peerId: string; p: number[] }[]; connection: string };
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
