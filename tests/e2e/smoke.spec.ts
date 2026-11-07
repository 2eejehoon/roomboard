import { expect, test } from '@playwright/test';

test('the app shell loads and the Worker answers', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('roomboard');
  await expect(page.locator('main')).toBeAttached();
  const res = await request.get('/api/nope');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ code: 'not_found' });
});

test('client routes render without a server round trip', async ({ page }) => {
  for (const [path, name] of [['/admin', 'admin'], ['/rooms/aB3dE5fG7h', 'room'], ['/new', 'create']]) {
    await page.goto(path);
    await expect(page.locator(`main[data-route="${name}"]`)).toBeAttached();
  }
});
