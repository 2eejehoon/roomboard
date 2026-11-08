import { expect, test, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { t } from '../../src/client/i18n/t.ts';
import { enter, move, newPage, withoutWebGL } from './helpers.ts';

// quickstart Q4 and the 2D half of Q1 (US2, T051). The dev server serves the 3D code as room3d/*.tsx and pre-bundled deps,
// a build as Scene-*.js.
const THREE_D = /\/room3d\/|three|rapier|ecctrl|\/Scene-/;
const requests = (page: Page) => {
  const urls: string[] = [];
  page.on('request', (r) => void urls.push(r.url()));
  return urls;
};
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: '시드 방' });
const person = (page: Page, nickname: string) => page.getByRole('listitem').filter({ hasText: nickname });

test('Q4: without WebGL the room opens in 2D with no error and no 3D download', async ({ browser }) => {
  const page = await withoutWebGL(await newPage(browser));
  const urls = requests(page);
  const me = await enter(page);
  await expect(heading(page)).toBeVisible();
  await expect(person(page, me.nickname)).toContainText(ko['room2d.anim.idle']);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(ko['room2d.fallback'])).toHaveCount(0);
  await expect(page.getByRole('button', { name: ko['room.view3d'] }), 'no 3D to switch to').toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(urls.filter((u) => THREE_D.test(u))).toEqual([]);
});

test('switching 3D → 2D is remembered after a reload, and the keyboard alone gets back to 3D', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newPage(browser);
  const urls = requests(page);
  await enter(page);
  await expect(page.locator('canvas')).toBeVisible();
  expect(urls.some((u) => THREE_D.test(u)), 'the 3D view does download the 3D code').toBe(true);

  await page.getByRole('button', { name: ko['room.view2d'] }).click();
  await expect(heading(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  await enter(page);
  await expect(heading(page)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  const to3d = page.getByRole('button', { name: ko['room.view3d'] });
  for (let i = 0; i < 20 && !(await to3d.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(to3d).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(heading(page)).toHaveCount(0);
});

test('a 3D view that fails to load falls back to 2D with a notice, and rb.view stays unset', async ({ browser }) => {
  const page = await newPage(browser);
  await page.route(/\/room3d\/Scene\.tsx|\/Scene-[\w-]+\.js/, (r) => r.abort());
  await enter(page);
  await expect(page.getByText(ko['room2d.fallback'])).toBeVisible();
  await expect(heading(page)).toBeVisible();
  await expect(page.getByRole('button', { name: ko['room.view3d'] })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('rb.view'))).toBeNull();
});

test('a participant in 3D joining and leaving shows in the 2D list and is read out', async ({ browser }) => {
  test.setTimeout(60_000);
  const a = await withoutWebGL(await newPage(browser));
  await enter(a);
  const b = await newPage(browser);
  const peer = await enter(b);
  const live = a.locator('[aria-live="polite"]');
  await expect(person(a, peer.nickname)).toBeVisible({ timeout: 15_000 });
  await expect(live).toContainText(t('room2d.joined', { nickname: peer.nickname }));

  await b.context().close();
  await expect(person(a, peer.nickname)).toHaveCount(0, { timeout: 15_000 });
  await expect(live).toContainText(t('room2d.left', { nickname: peer.nickname }));
});

// T038 Q1, 2D half: timed without WebGL (see the T038 note in tasks.md).
test('Q1: a move shows in the other 2D list within a second', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect(person(b, me.nickname)).toContainText(ko['zone.entrance']);
  await a.waitForTimeout(500); // 3 m from the spawn stays under 8 m/s
  await move(a, [0, 0, 1]);
  await expect(person(b, me.nickname)).toHaveText(new RegExp(`${ko['room2d.anim.walk']}.*${ko['zone.tables']}`), { timeout: 1000 });
});
