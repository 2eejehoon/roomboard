// T046 (US4-1·2, FR-025~027): three screens (one 3D, two 2D) start a match, see the same start, lose stocks by falling and
// leaving by the exit, and end with the same ranks and everyone back at 0%. A fresh room: a running match closes the entrance.
import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { createRoom, enter, move, newPage, state, test, withoutWebGL } from './helpers.ts';

type Brawl = {
  fighters: Record<string, { damage: number; knockedOut: boolean } | undefined>;
  match: { endsAt: number; players: { peerId: string; stocks: number }[] } | null;
  result: { peerId: string; rank: number }[] | null;
};
const brawl = (page: Page) => page.evaluate(() => (window as unknown as { __roomboard: { state(): { brawl: Brawl } } }).__roomboard.state().brawl);
const KO_Y = -9; // arena floor top 1 − koDepth 10

// One fall below koY: a stock less on that screen, then the 3 s respawn (moves are ignored until then) unless it was the last.
async function fall(page: Page, peerId: string, stocks: number) {
  const p = (await state(page)).you!.p;
  // A different depth each time: the socket drops a move the same as the last one sent.
  await move(page, [p[0]!, KO_Y - 1 - stocks, p[2]!]);
  await expect.poll(async () => (await brawl(page)).match?.players.find((q) => q.peerId === peerId)?.stocks, { timeout: 10_000 }).toBe(stocks);
  if (stocks > 0) await expect.poll(async () => (await brawl(page)).fighters[peerId]?.knockedOut, { timeout: 10_000 }).toBe(false);
}

test('US4: a match starts the same on three screens, ends with the same ranks and 0%; no start in the peace zone', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await newPage(browser);
  const roomId = await createRoom(host, `판 ${Date.now() % 100_000}`);
  const a = await newPage(browser);
  const b = await withoutWebGL(await newPage(browser));
  const c = await withoutWebGL(await newPage(browser));
  const path = `/rooms/${roomId}`;
  const [me, them, third] = [await enter(a, path), await enter(b, path), await enter(c, path)];
  const pages = [a, b, c];

  // FR-025: no start from the peace zone.
  await expect(b.getByRole('button', { name: ko['brawl.enter'] })).toBeVisible();
  await expect(b.getByRole('button', { name: ko['match.start'] })).toHaveCount(0);

  await a.waitForTimeout(1500); // stay under 8 m/s from the spawn
  await move(a, [5.5, 0, 2.5]);
  await b.getByRole('button', { name: ko['brawl.enter'] }).click();
  await c.getByRole('button', { name: ko['brawl.enter'] }).click();
  // The server ignores a start it would refuse, so wait until b sees all three in the arena.
  await expect.poll(async () => { const s = await state(b); return [s.you!, ...s.peers].filter((p) => p.p[0]! > 20).length; }, { timeout: 15_000 }).toBe(3);

  await b.getByRole('button', { name: ko['match.start'] }).click();
  for (const page of pages) await expect.poll(async () => (await brawl(page)).match?.players.length).toBe(3);
  const endsAt = (await brawl(a)).match!.endsAt;
  for (const page of pages) {
    await expect.poll(async () => (await brawl(page)).match?.endsAt, 'the same start on every screen').toBe(endsAt);
    await expect(page.getByText(/남은 시간 \d:\d\d/)).toBeVisible();
  }
  await expect(b.getByText(ko['brawl.log.matchStart'])).toBeVisible();

  // b jabs a once, so the 0% at the end means something.
  await a.waitForTimeout(3000);
  await move(a, [43.5, 1, 4.5]);
  await move(b, [42.5, 1, 4.5], Math.PI / 2);
  await a.waitForTimeout(500);
  await b.getByRole('button', { name: ko['brawl.jab'] }).click();
  for (const page of pages) await expect.poll(async () => (await brawl(page)).fighters[me.peerId]?.damage).toBe(3);

  // c falls three times: stocks 3 → 0, out to the room spawn (FR-026).
  await fall(c, third.peerId, 2);
  await expect(a.getByText(`${third.nickname} 목숨 2`)).toBeVisible();
  await fall(c, third.peerId, 1);
  await fall(c, third.peerId, 0);
  await expect.poll(async () => (await state(c)).you!.p).toEqual([0, 0, 4]);
  await expect(c.getByRole('button', { name: ko['brawl.jab'] })).toHaveCount(0);

  // b leaves by the exit cell [0, 1, 12] (world 20.5, 1, 12.5): out too, and a is the last one standing.
  await b.waitForTimeout(3500);
  await move(b, [20.5, 1, 12.5], -Math.PI / 2);

  const ranks = [{ peerId: me.peerId, rank: 1 }, { peerId: them.peerId, rank: 2 }, { peerId: third.peerId, rank: 3 }];
  for (const page of pages) {
    await expect.poll(async () => (await brawl(page)).result, { timeout: 10_000 }).toEqual(ranks);
    await expect.poll(async () => (await brawl(page)).fighters[me.peerId]?.damage ?? 0, 'back to 0% (FR-027)').toBe(0);
    await expect(page.getByText(`${ko['match.result']}: 1위 ${me.nickname}`)).toBeVisible();
    expect((await brawl(page)).match).toBeNull();
  }
});
