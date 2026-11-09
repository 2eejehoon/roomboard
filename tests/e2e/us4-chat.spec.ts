import { expect, type Page } from '@playwright/test';
import { ko } from '../../src/client/i18n/ko.ts';
import { enter, newPage, state, test, withoutWebGL } from './helpers.ts';

// quickstart Q8, Q9 (US4) and T074. Timed parts run without WebGL, like Q1 (T038): software WebGL starves the local Worker.
const panel = (page: Page) => page.getByRole('region', { name: ko['chat.heading'] });
const messages = (page: Page) => panel(page).getByRole('listitem');
const limited = /잠시 후 다시 시도해 주세요/;

// In 3D the panel is a <details>, folded on touch devices (screens.md S3 모바일); a tap on its summary opens it.
async function openPanel(page: Page) {
  const toggle = page.locator('details:not([open]) > summary');
  if (await toggle.count()) await toggle.click();
  await expect(panel(page).getByRole('textbox', { name: ko['chat.input'] })).toBeVisible();
}

async function say(page: Page, text: string) {
  const input = panel(page).getByRole('textbox', { name: ko['chat.input'] });
  await input.fill(text);
  await input.press('Enter');
}

test('Q8: a message reaches the same channel within a second, in 2D and 3D, with banned words masked', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(true);

  await say(a, '안녕 씨발');
  const seen = messages(b).filter({ hasText: me.nickname });
  await expect(seen).toContainText('안녕 **', { timeout: 1000 });
  await expect(seen).not.toContainText('씨발');
  await expect(b.locator('[aria-live="polite"]').filter({ hasText: '안녕 **' }), '2D reads new messages aloud').toHaveCount(1);
  await expect(messages(a).filter({ hasText: me.nickname }), 'the sender sees their own message').toContainText('안녕 **');

  const c = await newPage(browser);
  await enter(c);
  await expect(c.locator('canvas')).toBeVisible();
  await openPanel(c);
  await say(a, '3D에도');
  // No time limit on the 3D side (T070): CI's software WebGL can hold c's main thread for seconds (runs 42539252136, 42542585022).
  await expect(messages(c).filter({ hasText: me.nickname })).toContainText('3D에도', { timeout: 30_000 });
});

test('Q9: the 6th message within 10 seconds is not delivered and the sender is told to wait', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(true);

  for (let i = 1; i <= 6; i++) await say(a, `메시지 ${i}`);
  await expect(panel(a).getByRole('status')).toHaveText(limited);
  // PR #26 review: the held message comes back to the input and Enter does not send it while the wait (about 2 s) is on.
  // Pressed right after the notice shows: in CI the checks below take long enough for the wait to end (run 42543858915).
  const input = panel(a).getByRole('textbox', { name: ko['chat.input'] });
  await expect(input).toHaveValue('메시지 6');
  await input.press('Enter');
  await expect(messages(b)).toHaveCount(5);
  await b.waitForTimeout(500);
  await expect(messages(b)).toHaveCount(5);
  await expect(messages(b).filter({ hasText: '메시지 6' })).toHaveCount(0);

  // After the wait it goes.
  await expect(panel(a).getByRole('status')).toHaveCount(0, { timeout: 5000 });
  await input.press('Enter');
  await expect(messages(b).filter({ hasText: '메시지 6' })).toHaveCount(1);
  await expect(input).toHaveValue('');
});

// spec.md Edge Cases: an over-long message is not sent, and the sender is told (PR #26 review: it used to be cut to 200).
test('a pasted message over 200 characters is not sent and the sender is told', async ({ browser }) => {
  const a = await withoutWebGL(await newPage(browser));
  const b = await withoutWebGL(await newPage(browser));
  const me = await enter(a);
  await enter(b);
  await expect.poll(async () => (await state(b)).peers.some((p) => p.peerId === me.peerId)).toBe(true);

  await say(a, '가'.repeat(201));
  await expect(panel(a).getByRole('status')).toHaveText(ko['chat.tooLong']);
  await expect(panel(a).getByRole('textbox', { name: ko['chat.input'] }), 'the text stays to be shortened').toHaveValue('가'.repeat(201));
  await say(a, '가'.repeat(200));
  await expect(messages(b)).toHaveCount(1);
  await expect(messages(b)).toContainText('가'.repeat(200));
});

// T074 (screens.md S3 3D): Enter focuses the chat input, movement keys then type letters instead of moving, Esc lets go.
test('T074: while typing a chat, movement keys do not move my avatar', async ({ browser, isMobile }) => {
  test.setTimeout(90_000);
  const a = await newPage(browser);
  await enter(a);
  await expect(a.locator('canvas')).toBeVisible();
  await openPanel(a);
  const input = panel(a).getByRole('textbox', { name: ko['chat.input'] });
  const pose = async () => (await state(a)).you!;

  if (isMobile) {
    // PR #26 review: the open panel must not cover the joystick or the jump button (constitution: touch input stays usable).
    const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
    const chat = await box(a.locator('details'));
    for (const control of [a.getByRole('group', { name: ko['room3d.joystick'] }), a.getByText(ko['room3d.jump'], { exact: true })]) {
      const c = await box(control);
      expect(chat.y + chat.height <= c.y || c.y + c.height <= chat.y || chat.x + chat.width <= c.x || c.x + c.width <= chat.x, 'chat clear of the touch controls').toBe(true);
    }
  }

  // First prove W moves me here: the canvas shows before the models and physics load, so retry until it does.
  await expect(async () => {
    await a.keyboard.down('KeyW');
    await a.waitForTimeout(400);
    await a.keyboard.up('KeyW');
    await expect.poll(async () => (await pose()).p, { timeout: 2000 }).not.toEqual([0, 0, 4]);
  }).toPass({ timeout: 30_000 });
  await expect.poll(async () => (await pose()).a, { timeout: 15_000 }).toBe('idle');
  const stopped = (await pose()).p;

  // A phone has no Enter to reach the input (and Enter on the summary just tapped would fold the panel): tap it.
  if (isMobile) await input.click();
  else await a.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await a.keyboard.down('KeyW');
  await a.waitForTimeout(600);
  await a.keyboard.up('KeyW');
  await a.keyboard.type('wasd');
  await expect(input).toHaveValue(/^w+wasd$/);
  await a.waitForTimeout(1000);
  expect((await pose()).p, 'typing did not move me').toEqual(stopped);

  await a.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
});
