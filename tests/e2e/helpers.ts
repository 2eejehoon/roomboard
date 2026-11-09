import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';

// Shared by the room specs. seedroom01 comes from npm run seed:dev.
export type HookState = { you: { peerId: string; nickname: string; p: number[]; a: string } | null; peers: { peerId: string; p: number[]; a: string }[]; connection: string };
type Hooks = { __roomboard: { state(): HookState; move(p: number[], r: number): void } };
export const state = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__roomboard.state());
export const move = (page: Page, p: number[], r = 0) => page.evaluate(([p, r]) => (window as unknown as Hooks).__roomboard.move(p as number[], r as number), [p, r]);

// Contexts from browser.newContext() outlive the test; an earlier test's 3D pages would keep rendering and starve the next one.
const contexts: BrowserContext[] = [];
test.afterEach(() => Promise.all(contexts.splice(0).map((c) => c.close())));
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
  // Generous: another context's software-rendered 3D scene can hold the CPU while this one connects.
  await expect
    .poll(async () => (await page.evaluate(() => '__roomboard' in window)) && (await state(page)).connection, { timeout: 15_000 })
    .toBe('open');
  return (await state(page)).you!;
}
