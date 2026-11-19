// T017 (US1 scenarios 1, 3, 4; FR-033): a 3D page and a 2D page fight in the arena. Damage and knock-outs are read through the
// dev-only test hook; the 2D page uses its own buttons.
import { expect, type Page } from '@playwright/test';
import { enter, move, newPage, test, withoutWebGL } from './helpers.ts';

type Brawl = { fighters: Record<string, { damage: number; knockedOut: boolean } | undefined> };
type Me = { peerId: string; p: number[] };
const look = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __roomboard: { state(): { you: Me; brawl: Brawl } } }).__roomboard.state();
    return { you: s.you, brawl: s.brawl };
  });
const damageOf = async (page: Page, peerId: string) => (await look(page)).brawl.fighters[peerId]?.damage ?? 0;

test('US1: a 3D and a 2D player jab, knock out, respawn at 0%; the peace zone has no skill buttons', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPage(browser);
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  const them = await enter(b);

  // Peace zone (FR-013): the 2D page offers the way in, not skills.
  await expect(b.getByRole('button', { name: '경기장으로 가기' })).toBeVisible();
  await expect(b.getByRole('button', { name: '잽' })).toHaveCount(0);

  await a.waitForTimeout(1500); // stay under 8 m/s from the spawn
  await move(a, [5.5, 0, 2.5]);
  await b.getByRole('button', { name: '경기장으로 가기' }).click();
  for (const page of [a, b]) await expect.poll(async () => (await look(page)).you.p[0]).toBeGreaterThan(20);

  // a at the east edge, b a metre west of a facing east.
  await a.waitForTimeout(3000);
  await move(a, [43.5, 1, 4.5]);
  await move(b, [42.5, 1, 4.5], Math.PI / 2);
  await a.waitForTimeout(500);

  await b.getByRole('button', { name: '잽' }).click();
  await expect.poll(() => damageOf(a, me.peerId)).toBe(3);
  await expect.poll(() => damageOf(b, me.peerId), 'the same on both screens').toBe(3);
  await expect(b.getByText(`님을 쳤어요 (3%)`)).toBeVisible();

  // A smash from 3% (strength 24) sends a off the edge.
  await b.waitForTimeout(500);
  const smash = b.getByRole('button', { name: '강펀치' });
  await smash.hover();
  await b.mouse.down();
  await b.waitForTimeout(300);
  await b.mouse.up();
  await expect.poll(async () => (await look(a)).brawl.fighters[me.peerId]?.knockedOut, { timeout: 10_000 }).toBe(true);
  await expect(b.getByText('님이 떨어졌어요')).toBeVisible();
  // FR-006: three seconds later a stands at a start point at 0%.
  await expect.poll(async () => (await look(a)).brawl.fighters[me.peerId], { timeout: 10_000 }).toMatchObject({ damage: 0, knockedOut: false });
  await expect.poll(async () => (await look(a)).you.p[0]).toBeLessThan(44);
  expect(them.peerId).not.toBe(me.peerId);
});
