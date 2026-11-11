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
  await context.addInitScript(recordSockets);
  return context.newPage();
}

// CI's failure artifacts cannot be read from a cloud session, so a stuck connection explains itself in the log (T100, us1 T045):
// the room socket's open/welcome/close (with code), moves sent, and main-thread stalls over a second, in ms since page start.
function recordSockets() {
  const log: string[] = ((window as unknown as { __sockets: string[] }).__sockets = []);
  const at = () => Math.round(performance.now());
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.duration > 1000) log.push(`${Math.round(e.startTime)} stall ${Math.round(e.duration)}`);
  }).observe({ type: 'longtask' });
  const WS = window.WebSocket;
  window.WebSocket = class extends WS {
    moves = 0;
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      if (!String(url).includes('/ws')) return; // Vite's HMR socket
      log.push(`${at()} new`);
      this.addEventListener('open', () => log.push(`${at()} open`));
      this.addEventListener('message', (e) => String(e.data).includes('"t":"welcome"') && log.push(`${at()} welcome`));
      this.addEventListener('close', (e) => log.push(`${at()} close ${e.code} after ${this.moves} moves`));
    }
    send(data: Parameters<WebSocket['send']>[0]) {
      if (typeof data === 'string' && data.startsWith('{"t":"move"')) this.moves++;
      super.send(data);
    }
  };
}
export const socketLog = (page: Page) => page.evaluate(() => (window as unknown as { __sockets: string[] }).__sockets.join(', ')).catch((e: Error) => e.message);

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
    .toBe('open')
    .catch(async (e: Error) => {
      throw new Error(`${e.message}\nroom socket: ${await socketLog(page)}`);
    });
  return (await state(page)).you!;
}

// The create limit (3 per 60 s) is shared with us3 Q6, the other room specs and the other project's run, so wait it out once if it bites.
export async function createRoom(page: Page, title: string, password = 'owner-pass', themeId = 'cafe'): Promise<string> {
  const body = { title, description: 'E2E', themeId, password, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
  let res = await page.request.post('/api/rooms', { data: body });
  if (res.status() === 429) {
    await page.waitForTimeout(Number(res.headers()['retry-after'] ?? 60) * 1000);
    res = await page.request.post('/api/rooms', { data: body });
  }
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

// 003 contracts/visual-baseline.md: test-results/visual/<screen>-<size>.png, size from the project (phone or desktop).
export const shot = (page: Page, name: string, isMobile: boolean) =>
  page.screenshot({ path: `test-results/visual/${name}-${isMobile ? 'phone' : 'desktop'}.png` });

// Mean luminance (0~255) of a viewport box, the share of near-black pixels in it (luminance < 40) and the share within 6 of
// `rgb`, measured on a screenshot decoded by the browser itself. Boxes are fractions of the viewport: [x, y, width, height].
export async function brightness(page: Page, box: [number, number, number, number], rgb = [0, 0, 0]) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, box, rgb }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const [x, y, w, h] = [box[0] * img.width, box[1] * img.height, box[2] * img.width, box[3] * img.height].map(Math.round);
      const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      let dark = 0;
      let same = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i]! - rgb[0]!) <= 6 && Math.abs(d[i + 1]! - rgb[1]!) <= 6 && Math.abs(d[i + 2]! - rgb[2]!) <= 6) same++;
        const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
        sum += l;
        if (l < 40) dark++;
      }
      const n = d.length / 4;
      return { mean: sum / n, dark: dark / n, same: same / n };
    },
    { png, box, rgb },
  );
}
