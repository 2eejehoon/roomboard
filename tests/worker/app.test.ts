import { exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/worker/index.ts';

// openapi.yaml components.schemas.Error code enum.
const ERROR_CODES = ['validation', 'turnstile_failed', 'rate_limited', 'wrong_password', 'not_found', 'gone', 'unauthorized', 'internal'];
const IP = '203.0.113.77';
const headers = { 'cf-connecting-ip': IP, 'x-forwarded-for': IP, 'x-real-ip': IP };

app.get('/__test/throw', () => {
  throw new Error('boom');
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
