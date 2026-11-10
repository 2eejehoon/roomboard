import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { app } from '../../src/worker/index.ts';
import { deviceKey, joinRoom } from './rooms-helpers.ts';

// T093, quickstart Q14 (constitution II): after every API that writes D1, no table holds an email, phone number, IP or device key.
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
beforeEach(() => {
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    new Request(input, init).url === SITEVERIFY ? Promise.resolve(Response.json({ success: true })) : real(input, init),
  );
});
afterEach(() => vi.restoreAllMocks());

const IPV4 = '203.0.113.77';
const IPV6 = '2001:db8::77';
const adminEnv = { ...env, ADMIN_TOKEN: 'audit-admin-token' };
const call = (method: string, path: string, body?: unknown, ip = IPV4, e: Env = env) =>
  app.request(
    `/api${path}`,
    {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': 'audit-agent', authorization: 'Bearer audit-admin-token' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    e,
  );

const PATTERNS = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  phone: /(\+?82[- ]?|0)1[016-9][- ]?\d{3,4}[- ]?\d{4}/,
  ipv4: /\b\d{1,3}(\.\d{1,3}){3}\b/,
  ipv6: /\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}\b/i,
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
};

it('each pattern catches the kind of value it is for', () => {
  const samples = { email: 'a.b@example.com', phone: '010-1234-5678', ipv4: IPV4, ipv6: IPV6, uuid: deviceKey(11) };
  for (const [kind, re] of Object.entries(PATTERNS)) expect(re.test(samples[kind as keyof typeof samples]), kind).toBe(true);
});

it('a full create → join → chat → report → edit → admin run leaves no personal data in any D1 table', async () => {
  const created = await call('POST', '/rooms', { title: '감사 방', description: '설명', themeId: 'cafe', password: 'pass1234', turnstileToken: 'tok' });
  expect(created.status).toBe(201);
  const { id: roomId } = await created.json<{ id: string }>();

  const a = await joinRoom(roomId, 11);
  const b = await joinRoom(roomId, 12);
  await a.next(); // peer_joined
  a.send({ t: 'chat', text: '안녕하세요' });
  const chat = await b.next();
  if (chat.t !== 'chat') throw new Error(`expected chat, got ${chat.t}`);
  const { messageId, nickname, text, sentAt, channel, sig } = chat;
  const message = { messageId, nickname, text, sentAt, channel, sig };

  expect((await call('POST', '/reports', { target: { type: 'room', roomId }, reason: 'spam', deviceKey: deviceKey(12) })).status).toBe(201);
  expect((await call('POST', '/reports', { target: { type: 'message', roomId, message }, reason: 'abuse', deviceKey: deviceKey(12) }, IPV6)).status).toBe(201);
  expect((await call('PATCH', `/rooms/${roomId}`, { password: 'pass1234', title: '바뀐 감사 방' }, IPV6)).status).toBe(200);
  await new Promise((r) => setTimeout(r, 2500)); // online_count alarm (2 s debounce) writes D1 too
  const listed = await call('GET', '/admin/reports', undefined, IPV4, adminEnv);
  const { items } = await listed.json<{ items: { id: number; roomId: string }[] }>();
  const mine = items.find((i) => i.roomId === roomId)!;
  expect((await call('POST', `/admin/reports/${mine.id}/resolve`, undefined, IPV6, adminEnv)).status).toBe(204);
  expect((await call('DELETE', `/admin/rooms/${roomId}`, undefined, IPV4, adminEnv)).status).toBe(204);

  const { results: tables } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>();
  expect(tables.map((t) => t.name).sort()).toEqual(['reports', 'rooms']);
  for (const { name } of tables) {
    const dump = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results);
    expect(dump).toContain(roomId); // the run really wrote here
    for (const [kind, re] of Object.entries(PATTERNS)) expect(dump.match(re)?.[0], `${name}: ${kind}`).toBeUndefined();
    expect(dump).not.toContain('audit-agent');
  }
});
