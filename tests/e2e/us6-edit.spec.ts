import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, newPage, state, test, withoutWebGL } from './helpers.ts';

// T081 / quickstart Q11, screens.md S3 (방이 삭제됨) and S4. A room of its own: the other specs share seedroom01.
// Pages run without WebGL so no 3D scene holds the CPU (T038).
const PASSWORD = 'owner-pass';

// The create limit (3 per 60 s) is shared with us3 Q6 and the other project's run, so wait it out once if it bites.
async function createRoom(page: Page, title: string): Promise<string> {
  const body = { title, description: 'US6 E2E', themeId: 'cafe', password: PASSWORD, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
  let res = await page.request.post('/api/rooms', { data: body });
  if (res.status() === 429) {
    await page.waitForTimeout(Number(res.headers()['retry-after'] ?? 60) * 1000);
    res = await page.request.post('/api/rooms', { data: body });
  }
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const openEdit = async (page: Page, id: string) => {
  await page.goto(`/rooms/${id}`);
  await page.getByRole('link', { name: ko['room.edit'] }).click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${id}/edit$`));
};

test('Q11: wrong password is refused; an edit reaches the board and the room; a delete sends the room out to the board', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const owner = await withoutWebGL(await newPage(browser));
  const id = await createRoom(owner, `US6 방 ${suffix}`);
  const guest = await withoutWebGL(await newPage(browser));
  await enter(guest, `/rooms/${id}`);

  await openEdit(owner, id);
  await expect(owner.getByLabel(ko['create.title'])).toHaveValue(`US6 방 ${suffix}`);
  await expect(owner.getByRole('radio', { name: ko['theme.cafe'] })).toBeChecked();
  const newTitle = `고친 방 ${suffix}`;
  await owner.getByLabel(ko['create.title']).fill(newTitle);
  await owner.getByLabel(ko['create.password']).fill('wrong-pass');
  await owner.getByRole('button', { name: ko['edit.save'] }).click();
  await expect(owner.getByRole('alert')).toHaveText(ko['edit.wrongPassword']);

  await owner.getByLabel(ko['create.password']).fill(PASSWORD);
  await owner.getByRole('button', { name: ko['edit.save'] }).click();
  await expect(owner).toHaveURL(new RegExp(`/rooms/${id}$`));
  await expect(owner.getByRole('heading', { level: 1, name: newTitle })).toBeVisible();
  await expect(guest.getByRole('heading', { level: 1, name: newTitle }), 'room_updated reached the guest').toBeVisible();
  const board = await newPage(browser);
  await board.goto('/');
  await expect(board.getByRole('listitem').filter({ hasText: newTitle })).toBeVisible();

  await openEdit(owner, id);
  await owner.getByLabel(ko['create.password']).fill(PASSWORD);
  await owner.getByRole('button', { name: ko['edit.delete'] }).click();
  const confirm = owner.getByRole('dialog');
  await expect(confirm).toContainText(ko['edit.confirmDelete']);
  await confirm.getByRole('button', { name: ko['edit.delete'] }).click();
  await expect(owner).toHaveURL(/\/$/);

  const sockets: unknown[] = [];
  guest.on('websocket', (ws) => sockets.push(ws));
  const notice = guest.getByRole('alertdialog');
  await expect(notice).toContainText(ko['room.deleted']);
  expect((await state(guest)).connection).toBe('closed');
  await guest.waitForTimeout(3000);
  expect(sockets, 'no reconnect after room_deleted').toHaveLength(0);
  await notice.getByRole('button', { name: ko['room.ok'] }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByRole('listitem').filter({ hasText: newTitle })).toHaveCount(0);
});
