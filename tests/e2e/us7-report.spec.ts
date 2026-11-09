import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { createRoom, enter, newPage, state, test, withoutWebGL } from './helpers.ts';

// T088 / quickstart Q12, Q13, Q15, screens.md 신고 대화상자 and S5. A room of its own: deleting is final, and others share seedroom01.
// Requests per project run: 3 reports (limit 10 per 60 s), 2 failed admin tokens (limit 5 per 60 s, both projects together 4).
// So running this spec again within a minute of a full run can meet the token limit (429) on the wrong-token step.
const ADMIN_TOKEN = 'dev-admin-token'; // .dev.vars.example

async function report(page: Page, open: () => Promise<void>, reason: string, expected: string) {
  await open();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: reason }).check();
  await dialog.getByRole('button', { name: ko['report.send'] }).click();
  // The Astryx close and send buttons carry empty status regions of their own.
  await expect(dialog.getByRole('status').filter({ hasText: expected })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('Q12, Q15, Q13: a message and a room are reported, once per device; the admin sees them, deletes the room, and it is gone', async ({ browser }) => {
  test.setTimeout(120_000);
  const title = `US7 방 ${Date.now().toString(36)}`;
  const a = await withoutWebGL(await newPage(browser));
  const id = await createRoom(a, title);
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a, `/rooms/${id}`);
  await enter(b, `/rooms/${id}`);
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(true);

  const said = `신고할 말 ${title}`;
  const input = a.getByRole('textbox', { name: ko['chat.input'] });
  await input.fill(said);
  await input.press('Enter');
  const reportMessage = b.getByRole('button', { name: ko['report.messageLabel'].replace('{nickname}', me.nickname) });
  await expect(reportMessage).toBeVisible();
  await report(b, () => reportMessage.click(), ko['report.reason.abuse'], ko['report.accepted']);

  const reportRoom = () => b.getByRole('button', { name: ko['report.room'] }).click();
  await report(b, reportRoom, ko['report.reason.spam'], ko['report.accepted']);
  await report(b, reportRoom, ko['report.reason.spam'], ko['report.duplicate']);

  expect((await b.request.get('/api/admin/reports')).status(), 'Q13').toBe(401);

  const admin = await withoutWebGL(await newPage(browser));
  await admin.goto('/admin');
  const token = admin.getByLabel(ko['admin.token']);
  await token.fill('not-the-token');
  await admin.getByRole('button', { name: ko['admin.enter'] }).click();
  await expect(token).toHaveAccessibleDescription(ko['admin.unauthorized']);
  await token.fill(ADMIN_TOKEN);
  await admin.getByRole('button', { name: ko['admin.enter'] }).click();

  const rows = admin.getByRole('listitem').filter({ hasText: title });
  await expect(rows).toHaveCount(2);
  const messageRow = rows.filter({ hasText: said });
  await expect(messageRow).toContainText(me.nickname);
  await expect(messageRow).toContainText(ko['report.reason.abuse']);
  const roomRow = rows.filter({ hasText: ko['report.reason.spam'] });
  await expect(roomRow).toContainText(ko['admin.count'].replace('{n}', '1')); // the duplicate is not counted
  await expect(roomRow.getByRole('link', { name: title })).toHaveAttribute('href', `/rooms/${id}`);

  await roomRow.getByRole('button', { name: ko['admin.deleteRoom'] }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: ko['admin.deleteRoom'] }).click();
  await expect(rows).toHaveCount(0);
  await expect(a.getByRole('alertdialog', { name: ko['room.deleted'] }), 'people in the room are told').toBeVisible();
  await admin.getByRole('tab', { name: ko['admin.resolved'] }).click();
  await expect(rows, 'both reports on the room were resolved with it').toHaveCount(2);

  await b.goto(`/rooms/${id}`);
  await expect(b.getByText(ko['room.gone'])).toBeVisible();
});
