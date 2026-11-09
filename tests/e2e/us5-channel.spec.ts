import { expect, test } from '@playwright/test';
import { enter, newPage, state, withoutWebGL } from './helpers.ts';

// T076 (US5): the header shows the channel and its head count, and 2D's <main> shows the channel (screens.md S3).
// Filling a channel to 21 is the Worker test's job (T075, quickstart Q10); here the counts move with two visitors.
test('the header and 2D show "채널 N" and the head count out of 20', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  await enter(a);
  const them = await enter(b);
  await expect.poll(async () => (await state(a)).peers.some((p) => p.peerId === them.peerId)).toBe(true);

  for (const page of [a, b]) {
    await expect(page.locator('header')).toContainText('채널 1 · 2/20');
    // The 2D section: the one holding the room's <h1>.
    await expect(page.locator('section').filter({ has: page.getByRole('heading', { level: 1 }) })).toContainText('채널 1');
  }
  await b.context().close();
  await expect(a.locator('header')).toContainText('채널 1 · 1/20');
});
