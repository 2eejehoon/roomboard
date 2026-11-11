import { expect, type Page } from '@playwright/test';
import { THEME_IDS } from '../../src/core/themes.ts';
import { ko } from '../../src/client/i18n/ko.ts';
import { brightness, createRoom, enter, newPage, shot, test, withoutWebGL } from './helpers.ts';

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
  expect([black.mean, black.same, white.mean, white.same].map(Math.round)).toEqual([0, 1, 255, 1]);
});

// One room per theme for the whole run: the second project finds the first one's, so the shared create limit is spent once.
async function themeRoom(page: Page, themeId: string): Promise<string> {
  const title = `시각 ${themeId}`;
  const { items } = (await (await page.request.get('/api/rooms')).json()) as { items: { id: string; title: string }[] };
  return items.find((r) => r.title === title)?.id ?? createRoom(page, title, 'owner-pass', themeId);
}

// US1: the seed room is the first theme; the others are created (the create limit allows 3 a minute, shared with other specs).
for (const themeId of THEME_IDS) {
  test(`room3d-${themeId}: a finished place, not a dark avatar on a plain board`, async ({ browser, isMobile }) => {
    test.setTimeout(120_000);
    const page = await newPage(browser);
    // This device key gets char-01 (src/core/identity.ts avatarFor): skin, a blue shirt, brown hair and trousers, nothing near black.
    await page.addInitScript(() => localStorage.setItem('rb.deviceKey', '00000000-0000-4000-8000-000000000013'));
    const path = themeId === THEME_IDS[0] ? '/rooms/seedroom01' : `/rooms/${await themeRoom(page, themeId)}`;
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

// US2 (SC-003, SC-005): what a screen fails, as readable lines. Text contrast is WCAG's (4.5:1, 3:1 for large text) against the
// backgrounds up the tree, translucent ones blended over what is below them (white at the root); on a phone every control is at least 44×44 px; nothing scrolls sideways.
function audit(page: Page, isMobile: boolean) {
  return page.evaluate((isMobile) => {
    const fails: string[] = [];
    const rgba = (c: string) => {
      const [r = 0, g = 0, b = 0, a = 1] = (c.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}"`;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
      const s = getComputedStyle(el);
      const layers: number[][] = [];
      for (let a: Element | null = el; a && layers.at(-1)?.[3] !== 1; a = a.parentElement) {
        const c = rgba(getComputedStyle(a).backgroundColor);
        if (c[3]! > 0) layers.push(c);
      }
      const bg = layers.reduceRight((under, [r, g, b, a]) => [0, 1, 2].map((i) => [r!, g!, b!][i]! * a! + under[i]! * (1 - a!)), [255, 255, 255]);
      const [l1, l2] = [lum(rgba(s.color)), lum(bg)].sort((a, b) => b - a);
      const ratio = (l1! + 0.05) / (l2! + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) fails.push(`contrast ${ratio.toFixed(2)} ${name(el)}`);
    }
    if (isMobile)
      for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab]')) {
        // The tap lands on the nearest box that handles clicks (a field's frame, a radio's card) when the control sits inside one.
        let box: Element = el;
        for (let a = el.parentElement, i = 0; a && i < 3; a = a.parentElement, i++) if ((a as HTMLElement).onclick) box = a;
        const r = box.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) continue; // visually hidden, for screen readers only
        if (visible(el) && (r.width < 44 || r.height < 44)) fails.push(`target ${Math.round(r.width)}×${Math.round(r.height)} ${name(el)}`);
      }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) fails.push('scrolls sideways');
    return fails;
  }, isMobile);
}

test('list: rooms as cards, readable and easy to tap', async ({ browser, isMobile }) => {
  const page = await newPage(browser);
  await page.goto('/');
  await expect(page.locator('main a[href^="/rooms/"]').first()).toBeVisible();
  // FR-007: every room shows its theme as a picture.
  const rooms = page.getByRole('listitem');
  await expect(rooms.first().locator('img[src^="/assets/previews/"]')).toBeVisible();
  expect(await rooms.locator('img[src^="/assets/previews/"]').count()).toBe(await rooms.count());
  await shot(page, 'list', isMobile);
  expect(await audit(page, isMobile)).toEqual([]);
});

test('create: the form, readable and easy to tap', async ({ browser, isMobile }) => {
  const page = await newPage(browser);
  await page.goto('/new');
  await expect(page.getByRole('radio').first()).toBeVisible();
  await shot(page, 'create', isMobile);
  expect(await audit(page, isMobile)).toEqual([]);
});

test('room2d: the 2D room, readable and easy to tap', async ({ browser, isMobile }) => {
  const page = await withoutWebGL(await newPage(browser));
  await enter(page);
  await shot(page, 'room2d', isMobile);
  expect(await audit(page, isMobile)).toEqual([]);
});

test('admin: the report list, readable and easy to tap', async ({ browser, isMobile }) => {
  const page = await newPage(browser);
  const report = { id: 1, targetType: 'room', roomId: 'seedroom01', roomTitle: '시드 방', messageId: null, messageSnapshot: null, reason: 'spam', status: 'open', createdAt: 1_700_000_000_000, reportCount: 1 };
  await page.route('**/api/admin/reports?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [report], nextCursor: null }) }));
  await page.goto('/admin');
  await page.getByLabel(ko['admin.token']).fill('mock-token');
  await page.getByRole('button', { name: ko['admin.enter'] }).click();
  await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveCount(1);
  await shot(page, 'admin', isMobile);
  expect(await audit(page, isMobile)).toEqual([]);
});

// FR-006: over the 3D scene the header and the chat sit on their own light surface (the indoor sky is dark), and on a phone
// they cover at most half the screen.
test('room3d overlays: readable over the scene, at most half of a phone screen', async ({ browser, isMobile }) => {
  test.setTimeout(90_000);
  const page = await newPage(browser);
  await enter(page);
  await scene3d(page);
  const header = page.locator('header').first();
  const chat = page.locator('details').filter({ has: page.getByText(ko['chat.heading']) });
  for (const [name, el] of [['header', header], ['chat', chat]] as const) {
    const alpha = await el.evaluate((e) => Number(getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1));
    expect(alpha, `${name} background opacity`).toBeGreaterThanOrEqual(0.8);
  }
  if (isMobile) {
    const covered = (await header.boundingBox())!.height + (await chat.boundingBox())!.height;
    expect(covered, 'header and chat height').toBeLessThanOrEqual(page.viewportSize()!.height / 2);
  }
  expect((await audit(page, isMobile)).filter((f) => f.startsWith('contrast'))).toEqual([]);
});
