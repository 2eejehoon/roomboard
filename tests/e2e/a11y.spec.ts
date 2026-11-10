import { expect, type Locator, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { createRoom, enter, newPage, state, test, withoutWebGL } from './helpers.ts';

// T095, SC-007, constitution V: the 2D core actions (enter, see who is here, chat, report) with the keyboard alone.
// Tab until the target has focus, so the test fails if it cannot be reached in the tab order.
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`not reachable with Tab: ${target}`);
}

test('2D: enter from the list, see the other participant, chat and report with the keyboard only', async ({ browser }) => {
  test.setTimeout(90_000);
  const title = `키보드 방 ${Date.now().toString(36)}`;
  const page = await withoutWebGL(await newPage(browser));
  const id = await createRoom(page, title);
  const other = await withoutWebGL(await newPage(browser));
  const them = await enter(other, `/rooms/${id}`);

  await page.goto('/');
  await tabTo(page, page.getByRole('link', { name: title }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/rooms/${id}`);
  await expect.poll(async () => (await page.evaluate(() => '__roomboard' in window)) && (await state(page)).connection, { timeout: 30_000 }).toBe('open');

  await expect(page.getByRole('listitem').filter({ hasText: them.nickname })).toBeVisible();

  const said = `키보드로 ${title}`;
  await tabTo(page, page.getByRole('textbox', { name: ko['chat.input'] }));
  await page.keyboard.type(said);
  await page.keyboard.press('Enter');
  await expect(other.getByText(said).first()).toBeVisible();

  await tabTo(page, page.getByRole('button', { name: ko['report.room'] }));
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const reason = dialog.getByRole('radio', { name: ko['report.reason.spam'] });
  await tabTo(page, dialog.getByRole('radio').first());
  await page.keyboard.press('Space'); // spam is the first reason
  await expect(reason).toBeChecked();
  await tabTo(page, dialog.getByRole('button', { name: ko['report.send'] }));
  await page.keyboard.press('Enter');
  // The send button goes away with the form; focus must stay in the dialog or Escape and Tab land on the page.
  await expect(dialog.getByRole('status').filter({ hasText: ko['report.accepted'] })).toBeFocused();
  // On touch devices the Astryx tooltip of the dialog's close button, passed on the way with Tab, can stay open; Escape
  // closes the top layer first (WCAG 1.4.13), so one press for the tooltip if it is there, one for the dialog.
  if (await page.getByRole('tooltip').isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
