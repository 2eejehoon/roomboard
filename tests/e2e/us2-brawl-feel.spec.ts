// T029 (US2, FR-020~024): after a jab both screens derive the same hitstop end, trail and % colour from the server values;
// turning shaking off stays off after a reload. The 2D guard ends when the pointer lets go off the button (PR #88 review).
import { expect, type Page } from '@playwright/test';
import { enter, move, newPage, test, withoutWebGL } from './helpers.ts';

type Feel = { stopUntil: number; trail: boolean; color: string };
type Hooks = { __roomboard: { feel(peerId: string): Feel; state(): { brawl: { fighters: Record<string, { damage: number } | undefined> } } } };
const feel = (page: Page, peerId: string) => page.evaluate((id) => (window as unknown as Hooks).__roomboard.feel(id), peerId);
const damageOf = (page: Page, peerId: string) => page.evaluate((id) => (window as unknown as Hooks).__roomboard.state().brawl.fighters[id]?.damage ?? 0, peerId);

// Both into the arena by the 2D way in (a 3D page walks there by the hook), then a at x, b a metre west facing east.
async function face(a: Page, b: Page, x: number) {
  for (const page of [a, b]) {
    await page.waitForTimeout(1500);
    const enterButton = page.getByRole('button', { name: '경기장으로 가기' });
    if (await enterButton.count()) await enterButton.click();
    else await move(page, [5.5, 0, 2.5]);
  }
  await a.waitForTimeout(3000);
  await move(a, [x, 1, 4.5], -Math.PI / 2);
  await move(b, [x - 1, 1, 4.5], Math.PI / 2);
  await a.waitForTimeout(500);
}

test('US2: the same hitstop, trail and colour on both screens; shaking off survives a reload', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPage(browser);
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await face(a, b, 30.5);

  // A smash held 0.3 s (15%, strength 24) flies a for most of a second: long enough to see the trail on both screens.
  await b.getByRole('button', { name: '강펀치' }).hover();
  await b.mouse.down();
  await b.waitForTimeout(300);
  await b.mouse.up();
  await Promise.all([a, b].map((page) => expect.poll(async () => (await feel(page, me.peerId)).trail, { intervals: [50] }).toBe(true)));
  await Promise.all([a, b].map((page) => expect.poll(async () => (await feel(page, me.peerId)).trail, { timeout: 10_000 }).toBe(false)));
  const mine = await feel(a, me.peerId);
  expect(mine.color).toBe('white');
  expect(mine.stopUntil).toBeGreaterThan(0);
  expect(await feel(b, me.peerId), 'FR-024: the same on both screens').toEqual(mine);

  await a.getByRole('button', { name: '화면 흔들림 끄기' }).click();
  await expect(a.getByRole('button', { name: '화면 흔들림 켜기' })).toBeVisible();
  await a.reload();
  await expect(a.getByRole('button', { name: '화면 흔들림 켜기' })).toBeVisible({ timeout: 30_000 });
});

test('US2 (PR #88 review): a 2D guard let go off the button ends, so the next frontal jab is not reduced', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await face(a, b, 34.5);

  const guard = a.getByRole('button', { name: '방어' });
  await guard.hover();
  await a.mouse.down();
  await a.mouse.move(0, 0);
  await a.mouse.up();
  await a.waitForTimeout(300);
  await b.getByRole('button', { name: '잽' }).click();
  // Guarded the jab would be 0.6% (shown 1).
  await expect.poll(() => damageOf(a, me.peerId)).toBe(3);
});
