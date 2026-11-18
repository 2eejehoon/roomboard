import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, newPage, test, withoutWebGL } from './helpers.ts';

// T040 / quickstart B12, FR-004·FR-014. One real report per project run: the reports limit (RL_REPORT, 10 per 60 s) is shared
// with us7-report, so the 3D case checks the request it would send and answers it here. .dev.vars holds no real GitHub token,
// so the issue POST is answered here too; the Worker side of it is tests/worker/user-bug-reports.test.ts.
const ADMIN_TOKEN = 'dev-admin-token'; // .dev.vars.example

async function openDialog(page: Page, text: string) {
  await page.getByRole('button', { name: ko['bug.open'] }).click();
  const dialog = page.getByRole('dialog', { name: ko['bug.open'] });
  await dialog.getByRole('textbox', { name: ko['bug.text'] }).fill(text);
  const send = dialog.getByRole('button', { name: ko['report.send'] });
  await expect(send, 'enabled once Turnstile (test key) gives a token').toBeEnabled({ timeout: 15_000 });
  return { dialog, send };
}

test('B12: a bug report from the 2D room is accepted in place; the admin turns it into an issue and discards one', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await withoutWebGL(await newPage(browser));
  await enter(page);
  const said = `저장 버튼이 안 눌려요 ${Date.now().toString(36)}`;
  const { dialog, send } = await openDialog(page, said);
  const request = page.waitForRequest('**/api/bug-reports/user');
  await send.click();
  await expect(dialog.getByRole('status').filter({ hasText: ko['bug.accepted'] })).toBeVisible();
  expect((await request).postDataJSON().context).toMatchObject({ view: '2d', themeId: expect.any(String), connection: 'open' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).pathname, 'stays in the room').toBe('/rooms/seedroom01');

  const admin = await withoutWebGL(await newPage(browser));
  await admin.goto('/admin');
  await admin.getByLabel(ko['admin.token']).fill(ADMIN_TOKEN);
  await admin.getByRole('button', { name: ko['admin.enter'] }).click();
  await admin.getByRole('tab', { name: ko['admin.bugs'] }).click();
  const row = admin.getByRole('listitem').filter({ hasText: said });
  await expect(row).toContainText('2d');

  let issued: unknown;
  await admin.route('**/api/admin/bug-reports/*/issue', async (route) => {
    issued = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { issueNumber: 7 } });
  });
  await row.getByRole('textbox', { name: ko['admin.bugs.issueTitle'] }).fill('2D 저장 버튼 무반응');
  await row.getByRole('textbox', { name: ko['admin.bugs.summary'] }).fill('2D 화면에서 저장을 눌러도 반응이 없다');
  await row.getByRole('button', { name: ko['admin.bugs.issue'] }).click();
  await expect(admin.getByRole('status').filter({ hasText: ko['admin.bugs.issued'].replace('{n}', '7') })).toBeVisible();
  expect(issued).toEqual({ title: '2D 저장 버튼 무반응', summary: '2D 화면에서 저장을 눌러도 반응이 없다' });

  // The answered issue left the report pending on the server; discarding deletes it for real.
  await row.getByRole('button', { name: ko['admin.bugs.discard'] }).click();
  await expect(row).toHaveCount(0);
});

test('the 3D room has the same bug report, sending view 3d; a limit answer says to wait', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await newPage(browser);
  await enter(page);
  let context: unknown;
  await page.route('**/api/bug-reports/user', async (route) => {
    context = route.request().postDataJSON().context;
    await route.fulfill({ status: 429, json: { code: 'rate_limited', retryAfterMs: 60_000 } });
  });
  const { dialog, send } = await openDialog(page, '아바타가 벽에 낀다');
  await send.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(context).toMatchObject({ view: '3d', themeId: expect.any(String), connection: 'open' });
});

test('a Turnstile script that failed to load loads again on retry (PR #70 review)', async ({ browser }) => {
  const page = await withoutWebGL(await newPage(browser));
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
  await enter(page);
  await page.getByRole('button', { name: ko['bug.open'] }).click();
  const dialog = page.getByRole('dialog', { name: ko['bug.open'] });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.unroute('https://challenges.cloudflare.com/**');
  await dialog.getByRole('button', { name: ko['common.retry'] }).click();
  await dialog.getByRole('textbox', { name: ko['bug.text'] }).fill('다시 시도');
  await expect(dialog.getByRole('button', { name: ko['report.send'] })).toBeEnabled({ timeout: 15_000 });
});
