import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_ERRORS } from '../../src/core/api-schemas.ts';
import { createChatFilter, parseWordList } from '../../src/core/chat-filter.ts';
import { createRoomData } from '../../src/core/room-data.ts';
import list from '../../src/data/profanity-ko.txt?raw';
import { app } from '../../src/worker/index.ts';
import { verifyPassword } from '../../src/worker/password.ts';

// T058: POST /api/rooms (contracts/openapi.yaml, quickstart Q6·Q7).
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// workerd in the cloud session has no DNS, so siteverify answers here the way Cloudflare answers its documented test secrets.
let verified: FormData[] = [];
beforeEach(() => {
  verified = [];
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    if (req.url !== SITEVERIFY) return real(input, init);
    const form = await req.formData();
    verified.push(form);
    const success = form.get('secret') === PASS_SECRET;
    return Response.json({ success, 'error-codes': success ? [] : ['invalid-input-response'] });
  });
});
afterEach(() => vi.restoreAllMocks());

// Each test gets its own client IP, so the per-IP limit (3 per 60 s) only bites where a test means it to.
let ipSeq = 0;
const nextIp = () => `203.0.113.${++ipSeq}`;
const valid = (over: Record<string, unknown> = {}) => ({
  title: `새 방 ${crypto.randomUUID().slice(0, 8)}`,
  description: '어서 와요',
  themeId: 'library',
  password: 'pass1234',
  turnstileToken: 'token-from-widget',
  ...over,
});
const init = (body: unknown, ip = nextIp()): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const post = (body: unknown, ip?: string) => exports.default.fetch('https://roomboard.test/api/rooms', init(body, ip));
const rowsTitled = (title: string) => env.DB.prepare('SELECT * FROM rooms WHERE title = ?').bind(title).all();

describe('POST /api/rooms', () => {
  it('201 with the Room; D1 keeps only a PBKDF2 hash of the password', async () => {
    const body = valid();
    const res = await post(body);
    expect(res.status).toBe(201);
    const room = await res.json<Record<string, unknown>>();
    expect(room).toEqual({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
      title: body.title,
      description: '어서 와요',
      themeId: 'library',
      roomData: createRoomData('library'),
      onlineCount: 0,
      createdAt: expect.any(Number),
      updatedAt: room.createdAt,
    });

    const row = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(room.id).first<Record<string, unknown>>();
    const hash = String(row?.password_hash);
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(JSON.stringify(row)).not.toContain('pass1234');
    expect(await verifyPassword('pass1234', hash)).toBe(true);

    const got = await exports.default.fetch(`https://roomboard.test/api/rooms/${room.id}`);
    expect(await got.json()).toEqual(room);
  });

  it('asks siteverify with the secret and the widget token, and no client IP', async () => {
    await post(valid());
    expect(verified).toHaveLength(1);
    expect(Object.fromEntries(verified[0]!)).toEqual({ secret: PASS_SECRET, response: 'token-from-widget' });
  });

  it('trims title and description and masks banned words before storing', async () => {
    const filter = createChatFilter(parseWordList(list));
    const tag = crypto.randomUUID().slice(0, 8);
    const res = await post(valid({ title: `  씨발 방 ${tag}  `, description: ' 병신 같은 설명 ' }));
    expect(res.status).toBe(201);
    const room = await res.json<{ title: string; description: string }>();
    expect(room.title).toBe(filter(`씨발 방 ${tag}`));
    expect(room.title).not.toContain('씨발');
    expect(room.description).toBe(filter('병신 같은 설명'));
    expect(room.description).not.toContain('병신');
  });

  it.each([
    ['title', { title: '' }],
    ['title', { title: '   ' }],
    ['title', { title: 'a'.repeat(61) }],
    ['description', { description: 'a'.repeat(301) }],
    ['password', { password: 'abc' }],
    ['themeId', { themeId: 'space' }],
  ] as const)('400 fields.%s for %j; no room, no siteverify call', async (field, over) => {
    const body = valid(over);
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation', fields: { [field]: FIELD_ERRORS[field] } });
    expect(verified).toHaveLength(0); // validation first: a 400 must not spend the single-use widget token
    if (typeof body.title === 'string' && body.title.trim()) expect((await rowsTitled(body.title)).results).toHaveLength(0);
  });

  it('accepts 60 characters of title and 300 of description', async () => {
    const res = await post(valid({ title: '가'.repeat(54) + crypto.randomUUID().slice(0, 6), description: '나'.repeat(300) }));
    expect(res.status).toBe(201);
  });

  it('400 validation for a body that is not JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation' });
  });

  it('403 turnstile_failed when siteverify says no; no room', async () => {
    const body = valid();
    const res = await app.request('/api/rooms', init(body), { ...env, TURNSTILE_SECRET: FAIL_SECRET });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'turnstile_failed' });
    expect((await rowsTitled(body.title)).results).toHaveLength(0);
  });

  it('the env override above still reaches D1 and the room DO', async () => {
    const res = await app.request('/api/rooms', init(valid()), { ...env });
    expect(res.status).toBe(201);
  });

  it('429 on the 4th request from one client within 60 s, with Retry-After', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) expect((await post('{}', ip)).status).toBe(400);
    const res = await post(valid(), ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({ code: 'rate_limited', retryAfterMs: 60_000 });
    expect(verified).toHaveLength(0);
  });
});
