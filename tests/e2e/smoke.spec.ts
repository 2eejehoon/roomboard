import { expect, test } from '@playwright/test';

test('the app shell loads and the Worker answers', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('roomboard');
  await expect(page.locator('main')).toBeAttached();
  expect(await (await request.get('/api/health')).json()).toEqual({ ok: true });
});
