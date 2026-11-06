import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Error shape from specs/001-realtime-room-board/contracts/openapi.yaml.
app.notFound((c) => c.json({ code: 'not_found' }, 404));
app.onError((err, c) => {
  // Hono middleware (validator, bodyLimit) reports bad input this way.
  if (err instanceof HTTPException && err.status < 500) return c.json({ code: 'validation' }, err.status);
  // Constitution II: name and stack frames only. Messages can echo request content (JSON.parse quotes the body).
  console.error(err.name, err.stack?.split('\n').slice(1).join('\n'));
  return c.json({ code: 'internal' }, 500);
});

export default app;
