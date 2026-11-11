import { expect, type Page } from '@playwright/test';
import { THEME_IDS } from '../../src/core/themes.ts';
import { brightness, createRoom, enter, newPage, shot, test } from './helpers.ts';

// 003 contracts/visual-baseline.md: baseline screens in test-results/visual/ for the operator, plus the checks a machine can make.
// No pixel comparison: software WebGL renders differ from machine to machine (research R6).

// The 3D scene has loaded: the progress line is gone. Then a moment for the first frames with every model.
async function scene3d(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '%' })).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(2000);
}

test('brightness() reads what is on screen', async ({ browser }) => {
  const page = await newPage(browser);
  await page.setContent('<body style="margin:0"><div style="height:50vh;background:#000"></div><div style="height:50vh;background:#fff"></div></body>');
  const black = await brightness(page, [0, 0.1, 1, 0.3]);
  const white = await brightness(page, [0, 0.6, 1, 0.3], [255, 255, 255]);
  expect([black.mean, black.dark, black.same, white.mean, white.dark, white.same].map(Math.round)).toEqual([0, 1, 1, 255, 0, 1]);
});

// US1: the seed room is the first theme; the others are created (the create limit allows 3 a minute, shared with other specs).
for (const themeId of THEME_IDS) {
  test(`room3d-${themeId}: a finished place, not a dark avatar on a plain board`, async ({ browser, isMobile }) => {
    test.setTimeout(120_000);
    const page = await newPage(browser);
    // This device key gets char-01 (src/core/identity.ts avatarFor): skin, a blue shirt, brown hair and trousers, nothing near black.
    await page.addInitScript(() => localStorage.setItem('rb.deviceKey', '00000000-0000-4000-8000-000000000013'));
    const path = themeId === THEME_IDS[0] ? '/rooms/seedroom01' : `/rooms/${await createRoom(page, `시각 ${themeId}`, 'owner-pass', themeId)}`;
    await enter(page, path);
    await scene3d(page);
    await shot(page, `room3d-${themeId}`, isMobile);
    // FR-001: past the floor there is a wall or sky, not the plain 001 background colour #d9cbb8.
    const top = await brightness(page, [0, 0.15, 1, 0.12], [0xd9, 0xcb, 0xb8]);
    expect.soft(top.same, 'share of the plain 001 background in the band above the floor').toBeLessThan(0.2);
    // SC-002: my avatar's head (hair, face, eyes) in the middle of the view is not a black patch: its mean brightness is at least
    // half the view's (001 skin 0.013, research R4).
    const head = await brightness(page, isMobile ? [0.42, 0.46, 0.16, 0.1] : [0.46, 0.45, 0.08, 0.13]);
    const view = await brightness(page, [0, 0, 1, 1]);
    console.log(`SC-002 ${themeId} ${isMobile ? 'phone' : 'desktop'}: head ${Math.round(head.mean)}, view ${Math.round(view.mean)}`);
    expect.soft(head.mean / view.mean, "my avatar's head brightness over the view's").toBeGreaterThanOrEqual(0.5);
  });
}
