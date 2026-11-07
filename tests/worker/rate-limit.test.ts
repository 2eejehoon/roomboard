import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '../../src/worker/rate-limit.ts';

// T031 / research R9: the IP is the limiter key during the request only.
const IP = '198.51.100.23';
const limiter = (success: boolean) => {
  const keys: string[] = [];
  return { keys, binding: { limit: async ({ key }: { key: string }) => (keys.push(key), { success }) } };
};
const appWith = (binding: RateLimit) => new Hono().post('/x', rateLimit(() => binding, 60_000), (c) => c.text('ok'));

describe('rateLimit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes through under the limit, keyed by the client IP', async () => {
    const { keys, binding } = limiter(true);
    const res = await appWith(binding).request('/x', { method: 'POST', headers: { 'cf-connecting-ip': IP } });
    expect(res.status).toBe(200);
    expect(keys).toEqual([IP]);
  });

  it('answers 429 with Retry-After and retryAfterMs over the limit', async () => {
    const { binding } = limiter(false);
    const res = await appWith(binding).request('/x', { method: 'POST', headers: { 'cf-connecting-ip': IP } });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({ code: 'rate_limited', retryAfterMs: 60_000 });
  });

  it('does not log the IP', async () => {
    const logged: unknown[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a) => void logged.push(...a));
    for (const ok of [true, false]) await appWith(limiter(ok).binding).request('/x', { method: 'POST', headers: { 'cf-connecting-ip': IP } });
    expect(logged.map(String).join('\n')).not.toContain(IP);
  });
});
