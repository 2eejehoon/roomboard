import { expect, test, type Page } from '@playwright/test';
import { enter, newPage, state, withoutWebGL } from './helpers.ts';

// T076 (US5): the header shows the channel and its head count, and 2D's <main> shows the channel (screens.md S3).
// Filling a channel to 21 is the Worker test's job (T075, quickstart Q10); here the count follows one more visitor.
// The seed room is shared with earlier specs whose peers may still be leaving, so the header is compared with the live
// state (me plus the peers I see) rather than a fixed number or one read earlier (PR #27 review).
const header = (page: Page) => page.locator('header');
const matchesState = (page: Page) =>
  expect.poll(async () => {
    const people = (await state(page)).peers.length + 1;
    return (await header(page).textContent())?.includes(`채널 1 · ${people}/20`);
  }).toBe(true);

test('the header and 2D show "채널 N" and the head count out of 20', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  const them = await enter(b);
  await expect.poll(async () => (await state(a)).peers.some((p) => p.peerId === them.peerId)).toBe(true);

  for (const page of [a, b]) {
    await matchesState(page);
    // The 2D section: the one holding the room's <h1>.
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) })).toContainText('채널 1');
  }
  await b.context().close();
  await expect.poll(async () => (await state(a)).peers.some((p) => p.peerId === them.peerId)).toBe(false);
  await matchesState(a);
});
