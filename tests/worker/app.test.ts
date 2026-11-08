import { exports } from 'cloudflare:workers';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/worker/index.ts';

// openapi.yaml components.schemas.Error code enum.
const ERROR_CODES = ['validation', 'turnstile_failed', 'rate_limited', 'wrong_password', 'not_found', 'gone', 'unauthorized', 'internal'];
const IP = '203.0.113.77';
const headers = { 'cf-connecting-ip': IP, 'x-forwarded-for': IP, 'x-real-ip': IP };

app.get('/__test/throw', () => {
  throw new Error('boom');
});
app.post('/__test/json', async (c) => c.json(await c.req.json()));
app.get('/__test/http-400', () => {
  throw new HTTPException(400);
});
app.get('/__test/http-413', () => {
  throw new HTTPException(413);
});
app.get('/__test/http-401', () => {
  throw new HTTPException(401);
});
app.get('/__test/http-401-auth', () => {
  throw new HTTPException(401, { res: new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }) });
});

describe('worker app', () => {
  afterEach(() => vi.restoreAllMocks());

  it('unknown /api paths return 404 not_found', async () => {
    const res = await exports.default.fetch('https://roomboard.test/api/nope', { headers });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'not_found' });
  });

  it('unexpected errors return 500 in the Error shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/__test/throw', { headers });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body).toEqual({ code: 'internal' });
    expect(ERROR_CODES).toContain(body.code);
  });

  it('HTTPException 4xx from Hono middleware keeps its status as a validation error', async () => {
    for (const status of [400, 413]) {
      const res = await app.request(`/api/__test/http-${status}`);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code: 'validation' });
    }
    const res = await app.request('/api/__test/http-401');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
    const auth = await app.request('/api/__test/http-401-auth');
    expect(auth.headers.get('www-authenticate'), 'headers from the exception response are kept').toBe('Bearer');
    expect(auth.headers.get('content-type')).toMatch(/json/);
    expect(await auth.json()).toEqual({ code: 'unauthorized' });
  });

  it('logs the error without its message, so request content never reaches the logs', async () => {
    const logged: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a) => void logged.push(...a));
    for (const body of ['hunter2', 'x\nhunter2\n', '{"a":1,\n"pw": hunter2\n}', '\n    at hunter2 (x)\n']) {
      const res = await app.request('/api/__test/json', { method: 'POST', body });
      expect(res.status).toBe(500);
    }
    const text = logged.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join('\n');
    expect(text).toContain('SyntaxError');
    expect(text, 'stack frames are still logged').toMatch(/\n\s+at /);
    expect(text).not.toContain('hunter2');
  });

  it('never writes the client IP to responses or logs', async () => {
    const logged: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a) => void logged.push(...a));
    const responses = [await exports.default.fetch('https://roomboard.test/api/nope', { headers }), await app.request('/api/__test/throw', { headers })];
    for (const res of responses) {
      expect(await res.text()).not.toContain(IP);
      expect([...res.headers].join()).not.toContain(IP);
    }
    expect(logged.length, 'the 500 path should log something, or this test proves nothing').toBeGreaterThan(0);
    expect(logged.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join('\n')).not.toContain(IP);
  });
});
