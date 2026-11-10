import { expect, test } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';

test('the app shell loads and the Worker answers', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('roomboard');
  await expect(page.locator('main')).toBeAttached();
  const res = await request.get('/api/nope');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ code: 'not_found' });
});

test('client routes render their screen', async ({ page }) => {
  for (const [path, name] of [['/admin', 'admin'], ['/rooms/aB3dE5fG7h', 'room'], ['/new', 'create']]) {
    await page.goto(path);
    await expect(page.locator(`main[data-route="${name}"]`)).toBeAttached();
  }
});

// T094, screens.md S6: a room id nobody made shows "없는 방" and the way back (410 is in us7-report).
test('a missing room shows the S6 notice and goes back to the list', async ({ page }) => {
  await page.goto('/rooms/zzzzzzzzzz');
  await expect(page.getByRole('alert').getByText(ko['room.notFound'])).toBeVisible();
  await page.getByRole('button', { name: ko['room.toBoard'] }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('main[data-route="board"]')).toBeAttached();
});
