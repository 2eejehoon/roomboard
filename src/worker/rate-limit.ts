import type { Context, MiddlewareHandler } from 'hono';

type AppEnv = { Bindings: Env };

// research R9: the client IP is the limiter key for this request only; it is never stored or logged. periodMs must match the
// binding's configured period in wrangler.jsonc, which the binding does not expose.
export const rateLimit =
  (binding: (c: Context<AppEnv>) => RateLimit, periodMs: number): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const { success } = await binding(c).limit({ key: c.req.header('cf-connecting-ip') ?? 'unknown' });
    return success ? next() : tooMany(c, periodMs);
  };

export function tooMany(c: Context<AppEnv>, periodMs: number): Response {
  c.header('Retry-After', String(Math.ceil(periodMs / 1000)));
  return c.json({ code: 'rate_limited', retryAfterMs: periodMs }, 429);
}
