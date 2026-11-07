import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireRoom } from './rooms.ts';

export { RoomDurableObject } from './room-do.ts';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Error shape from specs/001-realtime-room-board/contracts/openapi.yaml.
app.notFound((c) => c.json({ code: 'not_found' }, 404));
// Hono middleware (validator, bodyLimit, auth) reports 4xx by throwing HTTPException; anything else is bad input.
const HTTP_CODES: Partial<Record<number, string>> = { 401: 'unauthorized', 404: 'not_found', 410: 'gone', 429: 'rate_limited' };
app.onError((err, c) => {
  if (err instanceof HTTPException && err.status < 500) {
    // Keep headers the middleware set (WWW-Authenticate, Retry-After); only the body becomes the Error shape.
    for (const [k, v] of err.getResponse().headers) if (k !== 'content-type' && k !== 'content-length') c.header(k, v);
    return c.json({ code: HTTP_CODES[err.status] ?? 'validation' }, err.status);
  }
  // Constitution II: name and stack frames only. The stack opens with "name: message", and messages (even multi-line ones)
  // can echo request content (JSON.parse), so skip exactly that many lines rather than guessing which lines are frames.
  const header = `${err.name}: ${err.message}`.split('\n').length;
  console.error(err.name, (err.stack ?? '').split('\n').slice(header).join('\n'));
  return c.json({ code: 'internal' }, 500);
});

app.get('/rooms/:roomId', async (c) => c.json(await requireRoom(c.env.DB, c.req.param('roomId'))));

app.get('/rooms/:roomId/ws', async (c) => {
  const { id } = await requireRoom(c.env.DB, c.req.param('roomId'));
  if (c.req.header('Upgrade') !== 'websocket') return c.body(null, 426);
  return c.env.ROOM.getByName(id).fetch(c.req.raw);
});

export default app;
