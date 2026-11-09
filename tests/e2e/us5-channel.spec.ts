import { expect, test, type Page } from '@playwright/test';
import { enter, newPage, state, withoutWebGL } from './helpers.ts';

// T076 (US5): the header shows the channel and its head count, and 2D's <main> shows the channel (screens.md S3).
// Filling a channel to 21 is the Worker test's job (T075, quickstart Q10); here the count moves with one more visitor.
// The seed room is shared with earlier specs, so the count is read relative to what a sees first.
const header = (page: Page) => page.locator('header');
const count = async (page: Page) => Number((await header(page).textContent())!.match(/채널 1 · (\d+)\/20/)![1]);

test('the header and 2D show "채널 N" and the head count out of 20', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  await expect(header(a)).toContainText(/채널 1 · \d+\/20/);
  const before = await count(a);
  expect(before, 'me plus the peers I see').toBe((await state(a)).peers.length + 1);
  const them = await enter(b);
  await expect.poll(async () => (await state(a)).peers.some((p) => p.peerId === them.peerId)).toBe(true);

  for (const page of [a, b]) {
    await expect(header(page)).toContainText(`채널 1 · ${before + 1}/20`);
    // The 2D section: the one holding the room's <h1>.
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) })).toContainText('채널 1');
  }
  await b.context().close();
  await expect(header(a)).toContainText(`채널 1 · ${before}/20`);
});
