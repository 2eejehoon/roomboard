import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireRoom } from './rooms.ts';

export { RoomDurableObject } from './room-do.ts';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

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

// T057 / research R8: /rooms/:id is index.html with the room's title and description, for search engines and clients
// without scripts, under the room's status code (404 and 410 too). HTMLRewriter escapes text and attribute values.
async function roomPage(req: Request, env: Env, id: string): Promise<Response> {
  const room = await requireRoom(env.DB, id).catch((e: unknown) => (e instanceof HTTPException ? e.status : Promise.reject(e)));
  // "/" and not "/index.html": the asset server redirects /index.html to /.
  const shell = await env.ASSETS.fetch(new URL('/', req.url));
  const page = new Response(shell.body, { status: typeof room === 'number' ? room : 200, headers: shell.headers });
  if (typeof room === 'number') return page;
  return new HTMLRewriter()
    .on('title', { element: (e) => void e.setInnerContent(room.title) })
    .on('meta[name="description"]', { element: (e) => void e.setAttribute('content', room.description) })
    .on('noscript', { element: (e) => void e.setInnerContent(`${room.title}\n${room.description}`) })
    .transform(page);
}

// run_worker_first sends /api/* and /rooms/* here; other /rooms/ paths (S4 edit) are the app shell as before.
export default {
  fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    const id = /^\/rooms\/([^/]+)$/.exec(pathname)?.[1];
    return id ? roomPage(req, env, id) : env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
