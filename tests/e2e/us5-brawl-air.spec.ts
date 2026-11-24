// T051 (US5-2, FR-029): knocked into the air, b presses the air jump twice; a's screen gets one air launch, and recovery once too.
import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, move, newPage, test, withoutWebGL } from './helpers.ts';

type Launches = { cause: string; peerId: string }[];
// What a's socket receives: every launch message, by cause and fighter.
function launches(page: Page): Launches {
  const got: Launches = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      const m = JSON.parse(String(f.payload)) as { t?: string; peerId?: string; launch?: { cause: string } };
      if (m.t === 'launch') got.push({ cause: m.launch!.cause, peerId: m.peerId! });
    }),
  );
  return got;
}
const flying = (page: Page, peerId: string) =>
  page.evaluate((id) => !!(window as unknown as { __roomboard: { flight(id: string): unknown } }).__roomboard.flight(id), peerId);

test('US5: two air jumps while flying are one on the other screen, and so is the recovery', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const seen = launches(a);
  await enter(a);
  const them = await enter(b);
  for (const page of [a, b]) {
    await page.getByRole('button', { name: ko['brawl.enter'] }).click();
    await expect(page.getByRole('button', { name: ko['brawl.jab'] })).toBeVisible({ timeout: 10_000 });
  }
  await a.waitForTimeout(3000);
  await move(a, [30.5, 1, 12.5], Math.PI / 2);
  await move(b, [31.5, 1, 12.5], -Math.PI / 2);
  await a.waitForTimeout(500);

  // A smash sends b up and away; once its hitstun (≤ 300 ms) is over, b jumps twice and recovers twice in the air.
  await a.getByRole('button', { name: ko['brawl.smash'] }).hover();
  await a.mouse.down();
  await a.waitForTimeout(300);
  await a.mouse.up();
  await expect.poll(() => flying(b, them.peerId)).toBe(true);
  await b.waitForTimeout(350);
  const jump = b.getByRole('button', { name: ko['brawl.airJump'] });
  await jump.click();
  await jump.click();
  const recover = b.getByRole('button', { name: ko['brawl.recover'] });
  await recover.click();
  await recover.click();

  await expect.poll(() => seen.filter((l) => l.peerId === them.peerId && l.cause === 'recover').length).toBe(1);
  await b.waitForTimeout(500);
  expect(seen.filter((l) => l.peerId === them.peerId && l.cause === 'air')).toHaveLength(1);
  expect(seen.filter((l) => l.peerId === them.peerId && l.cause === 'recover')).toHaveLength(1);
});
