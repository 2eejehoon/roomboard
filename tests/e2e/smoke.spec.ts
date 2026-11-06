import { expect, test } from '@playwright/test';

test('the app shell loads and the Worker answers', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('roomboard');
  await expect(page.locator('main')).toBeAttached();
  const res = await request.get('/api/nope');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ code: 'not_found' });
});
