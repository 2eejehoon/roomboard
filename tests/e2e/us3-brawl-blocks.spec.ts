// T037 (US3-1·2, FR-015a, FR-040): blocks placed and broken show the same on every screen, from 2D buttons and 3D keys alike;
// the admin's arena reset takes the built blocks away.
import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { createRoom, enter, move, newPage, test, withoutWebGL } from './helpers.ts';

type Diff = [number[], string | null, number][];
const blocks = (page: Page) => page.evaluate(() => (window as unknown as { __roomboard: { state(): { brawl: { blocks: Diff } } } }).__roomboard.state().brawl.blocks);
const at = (page: Page, cell: number[]) => blocks(page).then((d) => d.find(([c]) => c.join() === cell.join())?.slice(1) ?? null);

// b (2D) at cell [10, 1, 4] facing east, so its target is [11, 1, 4] (or [11, 0, 4] for the floor below).
async function intoArena(b: Page) {
  await b.getByRole('button', { name: ko['brawl.enter'] }).click();
  await expect(b.getByRole('button', { name: ko['brawl.place'] })).toBeVisible({ timeout: 10_000 });
  await b.waitForTimeout(3000);
  await move(b, [30.5, 1, 4.5], Math.PI / 2);
  await b.waitForTimeout(300);
}

test('US3: 2D buttons place and break, dirt in one hit and stone in four, the same on the 3D screen; a 3D key places too', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPage(browser);
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  await enter(b);
  await a.waitForTimeout(1500);
  await move(a, [5.5, 0, 2.5]);
  await intoArena(b);

  await b.getByRole('button', { name: ko['brawl.place'] }).click();
  await expect.poll(() => at(a, [11, 1, 4])).toEqual(['dirt', 1]);
  await b.getByRole('button', { name: ko['brawl.break'] }).click();
  await expect.poll(() => at(a, [11, 1, 4])).toBeNull();

  await b.getByRole('button', { name: '블록: 흙' }).click();
  await b.getByRole('button', { name: ko['brawl.place'] }).click();
  await expect.poll(() => at(a, [11, 1, 4])).toEqual(['stone', 4]);
  for (const hp of [3, 2, 1]) {
    await b.getByRole('button', { name: ko['brawl.break'] }).click();
    await expect.poll(() => at(a, [11, 1, 4])).toEqual(['stone', hp]);
  }
  await b.getByRole('button', { name: ko['brawl.break'] }).click();
  await expect.poll(() => at(a, [11, 1, 4])).toBeNull();
  await expect.poll(() => at(b, [11, 1, 4])).toBeNull();

  // The 3D page's F key places a dirt block in front of it, wherever it faces.
  const before = (await blocks(b)).length;
  await a.waitForTimeout(3000);
  await move(a, [33.5, 1, 9.5]);
  await a.waitForTimeout(500);
  await a.locator('canvas').click();
  // Held over a few frames: the scene reads keys once per frame, and a CI frame can be longer than a quick press.
  await a.keyboard.down('KeyF');
  await a.waitForTimeout(300);
  await a.keyboard.up('KeyF');
  await expect.poll(async () => (await blocks(b)).length).toBe(before + 1);
});

test('US3 (FR-040): the admin resets the arena of a reported room and the built block goes away', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await newPage(browser);
  const title = `경기장 ${Date.now() % 100_000}`;
  const roomId = await createRoom(admin, title);
  const res = await admin.request.post('/api/reports', { data: { target: { type: 'room', roomId }, reason: 'spam', deviceKey: '00000000-0000-4000-8000-000000000777' } });
  expect(res.status()).toBe(201);

  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  await enter(a, `/rooms/${roomId}`);
  await enter(b, `/rooms/${roomId}`);
  // a watches from the peace zone: block messages go to the whole channel.
  await intoArena(b);
  await b.getByRole('button', { name: ko['brawl.place'] }).click();
  await expect.poll(() => at(a, [11, 1, 4])).toEqual(['dirt', 1]);

  await admin.goto('/admin');
  await admin.getByLabel(ko['admin.token']).fill('dev-admin-token'); // .dev.vars.example
  await admin.getByRole('button', { name: ko['admin.enter'] }).click();
  const row = admin.getByRole('listitem').filter({ hasText: title });
  await row.getByRole('button', { name: ko['admin.resetArena'] }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: ko['admin.resetArena'] }).click();
  await expect.poll(() => blocks(a)).toEqual([]);
  await expect.poll(() => blocks(b)).toEqual([]);
});
