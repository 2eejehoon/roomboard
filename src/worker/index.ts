import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Error shape from specs/001-realtime-room-board/contracts/openapi.yaml. Logs carry the error only, never the request
// (constitution II: no IP in logs).
app.notFound((c) => c.json({ code: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ code: 'internal' }, 500);
});

export default app;
