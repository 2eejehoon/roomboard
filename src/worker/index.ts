import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));
// Error shape from specs/001-realtime-room-board/contracts/openapi.yaml.
app.notFound((c) => c.json({ code: 'not_found' }, 404));

export default app;
