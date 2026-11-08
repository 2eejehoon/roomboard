import { expect, test, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { newPage, withoutWebGL } from './helpers.ts';

// T061 / quickstart Q6·Q7, screens.md S1·S2. Only Q6 really creates a room: the create limit is 3 per 60 s for every test client.
// Pages run without WebGL so a new room's 3D scene does not hold the CPU (T038).
const submit = (page: Page) => page.getByRole('button', { name: ko['create.submit'] });
// Keyboard, not click(): a click that has to scroll the button into view first often lands in the Turnstile widget's
// cross-origin iframe (closed shadow root) and submits nothing; it failed every time locally and now and then in CI.
const send = (page: Page) => submit(page).press('Enter');

async function fillForm(page: Page, title: string) {
  await page.getByLabel(ko['create.title']).fill(title);
  await page.getByLabel(ko['create.description']).fill('E2E에서 만든 방');
  await page.getByRole('radio', { name: ko['theme.library'] }).check();
  await page.getByLabel(ko['create.password']).fill('pass1234');
  await expect(submit(page), 'enabled once the Turnstile test widget hands over its token').toBeEnabled({ timeout: 20_000 });
}

test('Q6: create from the board, land in the room; another visitor sees it on top of the board', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  await a.goto('/');
  await a.getByRole('link', { name: ko['board.create'] }).click();
  await expect(a).toHaveURL(/\/new$/);
  const title = `E2E 방 ${Date.now().toString(36)}`;
  await fillForm(a, title);
  await send(a);
  await expect(a).toHaveURL(/\/rooms\/[A-Za-z0-9_-]{10}$/);
  await expect(a.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const roomPath = new URL(a.url()).pathname;

  const b = await withoutWebGL(await newPage(browser));
  await b.goto('/');
  const first = b.getByRole('listitem').first();
  await expect(first).toContainText(title);
  await expect(first).toContainText(ko['theme.library']);
  await first.getByRole('link').click();
  await expect(b).toHaveURL(new RegExp(`${roomPath}$`));
});

test('Q7: a title of spaces shows the field error and sends nothing', async ({ browser }) => {
  const page = await newPage(browser);
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/rooms') && posts.push(r.url()));
  await page.goto('/new');
  await fillForm(page, '   ');
  await send(page);
  await expect(page.getByText(ko['field.title'])).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);
  expect(posts).toEqual([]);
});

test('Q7: a 403 from the bot check asks to redo the check and keeps the form', async ({ browser }) => {
  const page = await newPage(browser);
  await page.route(/\/api\/rooms(\?|$)/, (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 403, json: { code: 'turnstile_failed' } }) : route.fallback(),
  );
  await page.goto('/new');
  await fillForm(page, 'Turnstile 실패');
  await send(page);
  await expect(page.getByText(ko['create.turnstileFailed'])).toBeVisible();
  await expect(submit(page), 'the spent token is dropped').toBeDisabled();
  await expect(submit(page), 'a fresh widget hands over a new token').toBeEnabled({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByLabel(ko['create.title'])).toHaveValue('Turnstile 실패');
});

test('S1: an empty board offers to create the first room', async ({ browser }) => {
  const page = await newPage(browser);
  await page.route(/\/api\/rooms(\?|$)/, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { items: [], nextCursor: null } }) : route.fallback(),
  );
  await page.goto('/');
  await expect(page.getByText(ko['board.empty'])).toBeVisible();
  await page.getByRole('link', { name: ko['board.createFirst'] }).click();
  await expect(page).toHaveURL(/\/new$/);
});
