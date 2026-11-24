// T061 (FR-028·FR-033, precedent 2026-11-24-2d-held-direction): a 2D player picks a held direction before being hit, and the
// knockback bends toward it on the other screen too.
import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, move, newPage, test, withoutWebGL } from './helpers.ts';

type Fighters = Record<string, { launch: { v: number[] } | null }>;
const launchOf = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as { __roomboard: { state(): { brawl: { fighters: Fighters } } } }).__roomboard.state().brawl.fighters[id]?.launch?.v ?? null, id);

test('US5 2D: "방향 잡기" set to the front row bends a sideways jab toward it (FR-028)', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  const them = await enter(b);
  for (const page of [a, b]) {
    await page.getByRole('button', { name: ko['brawl.enter'] }).click();
    await expect(page.getByRole('button', { name: ko['brawl.jab'] })).toBeVisible({ timeout: 10_000 });
  }
  await a.waitForTimeout(3000);
  await move(a, [30.5, 1, 15.5], Math.PI / 2);
  await move(b, [31.5, 1, 15.5], -Math.PI / 2);
  await b.waitForTimeout(300);

  // None → left → right → front row: the front row is -z, so a jab pushing b along +x picks up a -z part.
  const steer = b.getByRole('button', { name: /^방향 잡기/ });
  for (let i = 0; i < 3; i++) await steer.click();
  await expect(steer).toHaveText('방향 잡기: 앞 줄');
  await b.waitForTimeout(300);

  await a.getByRole('button', { name: ko['brawl.jab'] }).click();
  for (const page of [a, b]) await expect.poll(async () => (await launchOf(page, them.peerId))?.[2] ?? 0).toBeLessThan(0);
  const [vx, , vz] = (await launchOf(a, them.peerId))!;
  expect(Math.atan2(-vz!, vx!)).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-3);
});
