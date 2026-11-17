import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserOf, installCollector, reportError, setRoomView, toReport } from '../../src/client/bug/collector.ts';
import { clientErrorReport } from '../../src/core/api-schemas.ts';

const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length;
const error = (message: string, stack: string, name = 'TypeError') => Object.assign(new Error(message), { name, stack });

describe('toReport (research R4, contracts/openapi.yaml ClientErrorReport)', () => {
  it('redacts, sends file names only and fits the schema', () => {
    const r = toReport(error('no room "my secret room" for a@b.io', 'TypeError: x\n    at RoomPage (https://x.dev/assets/index-abc.js?t=1:3:40)'), '3d', chromeUA);
    expect(r).toEqual({
      errorName: 'TypeError',
      message: 'no room [가림]',
      frames: [{ file: 'index-abc.js', fn: 'RoomPage', line: 3, col: 40 }],
      appVersion: 'dev',
      view: '3d',
      browser: 'chrome',
    });
    expect(clientErrorReport.safeParse(r).success).toBe(true);
  });

  it('redacts before cutting, so a cut never leaves half an email', () => {
    const r = toReport(error(`${'x'.repeat(490)} someone@example.com`, ''), 'board', chromeUA);
    expect(r.message).not.toContain('someone');
  });

  it('cuts the worst case to the schema limits and under 4KB of UTF-8, dropping frames from the end', () => {
    const line = (i: number) => `    at ${'함'.repeat(150)}${i} (https://x.dev/${'p/'.repeat(150)}${'f'.repeat(250)}.js:1:1)`;
    const stack = ['E: m', ...Array.from({ length: 30 }, (_, i) => line(i))].join('\n');
    const r = toReport(error('가'.repeat(600), stack, 'N'.repeat(200)), '2d', chromeUA);
    expect(clientErrorReport.safeParse(r).success).toBe(true);
    expect(bytes(r)).toBeLessThanOrEqual(4096);
    expect(r.frames.length).toBeGreaterThan(0);
    expect(r.frames[0]!.fn.startsWith('함')).toBe(true);
  });
});

describe('browserOf (UA string itself is never sent)', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'samsung'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'edge'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'firefox'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15', 'firefox'],
    [chromeUA, 'chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1', 'chrome'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'safari'],
    ['curl/8.0', 'other'],
  ])('%s', (ua, browser) => {
    expect(browserOf(ua)).toBe(browser);
  });
});

describe('reportError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setRoomView(null);
  });
  const stub = (pathname = '/rooms/aB3dE5fG7h') => {
    const fetch = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { userAgent: chromeUA });
    vi.stubGlobal('location', { pathname });
    return fetch;
  };
  const sent = (fetch: ReturnType<typeof stub>, i = 0) => JSON.parse((fetch.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);

  it('posts to /api/bug-reports with the current view and swallows a failed send', async () => {
    const fetch = stub();
    setRoomView('2d');
    reportError(new Error('boom'), 0);
    expect(fetch).toHaveBeenCalledWith('/api/bug-reports', expect.objectContaining({ method: 'POST', keepalive: true }));
    expect(sent(fetch).view).toBe('2d');
    await Promise.resolve(); // the rejected fetch must not escape as an unhandled rejection
  });

  it('maps /admin to admin and other screens to board', () => {
    const fetch = stub('/admin');
    reportError(new Error('a'), 1e6);
    vi.stubGlobal('location', { pathname: '/new' });
    reportError(new Error('b'), 2e6);
    expect([sent(fetch, 0).view, sent(fetch, 1).view]).toEqual(['admin', 'board']);
  });

  it('sends at most 10 a minute', () => {
    const fetch = stub();
    for (let i = 0; i < 15; i++) reportError(new Error(`e${i}`), 1e7 + i);
    expect(fetch).toHaveBeenCalledTimes(10);
    reportError(new Error('later'), 1e7 + 60_000);
    expect(fetch).toHaveBeenCalledTimes(11);
  });

  it('drops values that are not Errors (no stack to fingerprint)', () => {
    const fetch = stub();
    reportError('Script error.', 1e8);
    reportError({ reason: 'x' }, 1e8);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('installCollector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports window errors and unhandled rejections', () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { userAgent: chromeUA });
    vi.stubGlobal('location', { pathname: '/' });
    const target = new EventTarget();
    installCollector(target);
    target.dispatchEvent(Object.assign(new Event('error'), { error: new RangeError('r') }));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new SyntaxError('s') }));
    expect(fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).errorName)).toEqual(['RangeError', 'SyntaxError']);
  });
});
