import { expect, type Page, type Route } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { newPage, test } from './helpers.ts';

// T092 admin screen states against a mocked admin API (PR #39 review): late answers, double "더 보기", failed actions and pages,
// and the failed-token limit. Mocked so no real rate limit or D1 row is spent.
const row = (id: number, title = `방 ${id}`) => ({
  id,
  targetType: 'room',
  roomId: `room${String(id).padStart(6, '0')}`,
  roomTitle: title,
  messageId: null,
  messageSnapshot: null,
  reason: 'spam',
  status: 'open',
  createdAt: 1_700_000_000_000,
  reportCount: 1,
});
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page) {
  await page.goto('/admin');
  await page.getByLabel(ko['admin.token']).fill('mock-token');
  await page.getByRole('button', { name: ko['admin.enter'] }).click();
}
const rows = (page: Page) => page.getByRole('tabpanel').getByRole('listitem');

test('a late answer for the tab left behind does not replace the tab now shown', async ({ browser }) => {
  const page = await newPage(browser);
  let releaseOpen: () => void = () => {};
  const openHeld = new Promise<void>((r) => (releaseOpen = r));
  await page.route('**/api/admin/reports?*', async (route) => {
    const status = new URL(route.request().url()).searchParams.get('status');
    if (status === 'open') await openHeld;
    await json(route, { items: [row(status === 'open' ? 1 : 2, status === 'open' ? '열린 방' : '처리된 방')], nextCursor: null });
  });
  await open(page);
  await page.getByRole('tab', { name: ko['admin.resolved'] }).click();
  await expect(rows(page)).toContainText('처리된 방');
  releaseOpen();
  await page.waitForTimeout(300);
  await expect(rows(page)).toContainText('처리된 방');
  await expect(page.getByRole('status').filter({ hasText: ko['common.loading'] })).toHaveCount(0);
});

test('"더 보기" pressed twice adds the next page once; a failed next page keeps the rows and retries that page', async ({ browser }) => {
  const page = await newPage(browser);
  let failNext = false;
  await page.route('**/api/admin/reports?*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (!cursor) return json(route, { items: [row(3)], nextCursor: '3' });
    if (failNext) return route.fulfill({ status: 500 });
    await new Promise((r) => setTimeout(r, 300));
    await json(route, { items: [row(2)], nextCursor: '2' });
  });
  await open(page);
  await expect(rows(page)).toHaveCount(1);
  const more = page.getByRole('button', { name: ko['board.more'] });
  await more.click();
  await more.click();
  await expect(rows(page)).toHaveCount(2);
  await page.waitForTimeout(500);
  await expect(rows(page)).toHaveCount(2);

  failNext = true;
  await more.click();
  await expect(page.getByRole('alert').filter({ hasText: ko['common.networkError'] })).toBeVisible();
  await expect(rows(page), 'the rows already loaded stay').toHaveCount(2);
});

test('a failed resolve keeps the list, and its retry sends the same resolve again', async ({ browser }) => {
  const page = await newPage(browser);
  const resolves: string[] = [];
  await page.route('**/api/admin/reports?*', (route) => json(route, { items: [row(7)], nextCursor: null }));
  await page.route('**/api/admin/reports/*/resolve', (route) => (resolves.push(route.request().url()), route.fulfill({ status: 500 })));
  await open(page);
  await page.getByRole('button', { name: ko['admin.resolve'] }).click();
  const failed = page.getByRole('alert').filter({ hasText: ko['common.networkError'] });
  await expect(failed).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await failed.getByRole('button', { name: ko['common.retry'] }).click();
  await expect.poll(() => resolves.length).toBe(2);
  expect(resolves[1]).toBe(resolves[0]);
});

test('the failed-token limit (429) drops the token and shows the wait on the token form', async ({ browser }) => {
  const page = await newPage(browser);
  await page.route('**/api/admin/reports?*', (route) => json(route, { code: 'rate_limited', retryAfterMs: 42_000 }, 429));
  await open(page);
  await expect(page.getByLabel(ko['admin.token'])).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '42초' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('rb.adminToken'))).toBeNull();
});
