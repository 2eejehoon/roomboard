import { expect, test as base, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';

// Shared by the room specs. seedroom01 comes from npm run seed:dev.
export type HookState = { you: { peerId: string; nickname: string; p: number[]; a: string } | null; peers: { peerId: string; p: number[]; a: string }[]; connection: string };
type Hooks = { __roomboard: { state(): HookState; move(p: number[], r: number): void } };
export const state = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__roomboard.state());
export const move = (page: Page, p: number[], r = 0) => page.evaluate(([p, r]) => (window as unknown as Hooks).__roomboard.move(p as number[], r as number), [p, r]);

// Contexts from browser.newContext() outlive the test; an earlier test's 3D pages would keep rendering and starve the next one.
// An auto fixture, not a top-level test.afterEach: this module is evaluated once per worker, so such a hook registered only in
// the first spec that imported it, and every later spec left its pages open (13 extra peers by T074, T070).
const contexts: BrowserContext[] = [];
export const test = base.extend<{ closeContexts: void }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixture's dependencies from this destructuring
  closeContexts: [async ({}, use) => { await use(); await Promise.all(contexts.splice(0).map((c) => c.close())); }, { auto: true }],
});
export async function newPage(browser: Browser, options?: BrowserContextOptions) {
  const context = await browser.newContext(options);
  contexts.push(context);
  return context.newPage();
}

// A browser without WebGL (quickstart Q4).
export async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id.startsWith('webgl') ? null : getContext.call(this, id as '2d', ...(rest as []));
    } as typeof getContext;
  });
  return page;
}

export async function enter(page: Page, path = '/rooms/seedroom01') {
  await page.goto(path);
  // Generous: a software-rendered 3D scene, this page's or another context's, can hold the CPU while it connects. 15 s ran
  // out for a mobile 3D page in CI (runs 42539252136, 42541919523).
  await expect
    .poll(async () => (await page.evaluate(() => '__roomboard' in window)) && (await state(page)).connection, { timeout: 30_000 })
    .toBe('open');
  return (await state(page)).you!;
}

// The create limit (3 per 60 s) is shared with us3 Q6, the other room specs and the other project's run, so wait it out once if it bites.
export async function createRoom(page: Page, title: string, password = 'owner-pass'): Promise<string> {
  const body = { title, description: 'E2E', themeId: 'cafe', password, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
  let res = await page.request.post('/api/rooms', { data: body });
  if (res.status() === 429) {
    await page.waitForTimeout(Number(res.headers()['retry-after'] ?? 60) * 1000);
    res = await page.request.post('/api/rooms', { data: body });
  }
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
