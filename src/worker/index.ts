import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Error shape from specs/001-realtime-room-board/contracts/openapi.yaml.
app.notFound((c) => c.json({ code: 'not_found' }, 404));
// Hono middleware (validator, bodyLimit, auth) reports 4xx by throwing HTTPException; anything else is bad input.
const HTTP_CODES: Partial<Record<number, string>> = { 401: 'unauthorized', 404: 'not_found', 410: 'gone', 429: 'rate_limited' };
app.onError((err, c) => {
  if (err instanceof HTTPException && err.status < 500) return c.json({ code: HTTP_CODES[err.status] ?? 'validation' }, err.status);
  // Constitution II: name and "at ..." frames only. Messages, even multi-line ones, can echo request content (JSON.parse).
  console.error(err.name, (err.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).join('\n'));
  return c.json({ code: 'internal' }, 500);
});

export default app;
