import { createExecutionContext, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import worker from '../../src/worker/index.ts';
import { insertRoom } from './rooms-helpers.ts';

// T052 / quickstart Q5: GET /rooms/:id without scripts still carries the room's title and description (research R8).
// The static assets are not in the test pool; this ASSETS serves index.html at "/" only, as the platform does
// (/index.html redirects to /).
const ASSETS = {
  fetch: async (input: RequestInfo | URL) =>
    new URL(input instanceof Request ? input.url : input).pathname === '/'
      ? new Response(indexHtml, { headers: { 'content-type': 'text/html', etag: '"index"' } })
      : new Response('not found', { status: 404 }),
} as unknown as Fetcher;
const get = (path: string) => worker.fetch(new Request(`https://roomboard.test${path}`), { ...env, ASSETS }, createExecutionContext());

describe('GET /rooms/:id HTML', () => {
  it('puts the title in <title> and <noscript>, and the description in <meta name="description">', async () => {
    const id = await insertRoom({ title: '작은 카페', description: '쉬어 가는 "방"' });
    const res = await get(`/rooms/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('etag'), "not index.html's ETag").toBeNull();
    const html = await res.text();
    expect(html).toContain('<title>작은 카페</title>');
    expect(html).toContain('<meta name="description" content="쉬어 가는 &quot;방&quot;"');
    expect(html).toMatch(/<noscript>[^<]*작은 카페[^<]*쉬어 가는 (&quot;|")방(&quot;|")[^<]*<\/noscript>/);
    expect(html).toContain('<div id="root">');
  });

  it('escapes markup in the title and description', async () => {
    const id = await insertRoom({ title: '<script>alert(1)</script>', description: '"><img src=x onerror=alert(1)>' });
    const html = await (await get(`/rooms/${id}`)).text();
    expect(html).not.toContain('<script>alert(1)');
    // Inside a quoted attribute only the quote matters; in text, < is escaped.
    expect(html).toContain('<meta name="description" content="&quot;><img src=x onerror=alert(1)>"');
    expect(html).toContain('"&gt;&lt;img src=x onerror=alert(1)&gt;</noscript>');
    expect(html).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>');
  });

  it.each([
    ['an unknown room', 'nosuchroom', 404],
    ['a malformed id', 'x', 404],
    ['a broken escape', '%E0', 404],
  ])('%s is a 404 HTML page', async (_, id, status) => {
    const res = await get(`/rooms/${id}`);
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('a deleted room is a 410 HTML page', async () => {
    const res = await get(`/rooms/${await insertRoom({ deletedAt: 3000 })}`);
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('<div id="root">');
  });
});
