import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CLOSE } from '../../src/core/protocol.ts';
import { signChat } from '../../src/worker/chat-sign.ts';
import { app } from '../../src/worker/index.ts';
import { deviceKey, insertRoom, joinRoom } from './rooms-helpers.ts';

// T087: /api/admin/* (contracts/openapi.yaml, precedents 2026-11-06-admin-token, 2026-11-09-report-list-per-target, quickstart Q12, Q13).
const TOKEN = 'test-admin-token';
const adminEnv = { ...env, ADMIN_TOKEN: TOKEN };
let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;
const call = (method: string, path: string, opts: { token?: string | null; ip?: string; e?: Env } = {}) => {
  const headers: Record<string, string> = { 'cf-connecting-ip': opts.ip ?? nextIp() };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return app.request(`/api${path}`, { method, headers }, opts.e ?? adminEnv);
};
const report = (body: unknown) =>
  app.request('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': nextIp() }, body: JSON.stringify(body) }, env);
const reportRoom = (roomId: string, n: number, reason = 'spam') => report({ target: { type: 'room', roomId }, reason, deviceKey: deviceKey(n) });
async function reportMessage(roomId: string, n: number) {
  const fields = { messageId: 'm_test.1', nickname: '느긋한 수달', text: '나쁜 말', sentAt: Date.now(), channel: 2 };
  return report({ target: { type: 'message', roomId, message: { ...fields, sig: await signChat(env.SERVER_SECRET, roomId, fields) } }, reason: 'abuse', deviceKey: deviceKey(n) });
}

type Item = { id: number; targetType: string; roomId: string; roomTitle: string | null; messageId: string | null; messageSnapshot: unknown; reason: string; status: string; createdAt: number; reportCount: number };
type Page = { items: Item[]; nextCursor: string | null };
// Rows from earlier tests share the D1, so look only at this test's rooms.
async function list(status?: string, ...roomIds: string[]) {
  const items: Item[] = [];
  for (let cursor: string | null = ''; cursor !== null; ) {
    const q = new URLSearchParams({ ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) });
    const res = await call('GET', `/admin/reports?${q}`);
    expect(res.status).toBe(200);
    const page: Page = await res.json();
    items.push(...page.items);
    cursor = page.nextCursor;
  }
  return items.filter((i) => roomIds.includes(i.roomId));
}

describe('admin token', () => {
  it('401 unauthorized without a token or with a wrong one, and the 6th failure within 60 s is 429', async () => {
    const ip = nextIp();
    const none = await call('GET', '/admin/reports', { token: null, ip });
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ code: 'unauthorized' });
    for (let i = 0; i < 4; i++) expect((await call('GET', '/admin/reports', { token: 'wrong', ip })).status).toBe(401);
    const sixth = await call('GET', '/admin/reports', { token: TOKEN.slice(0, -1), ip });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('retry-after')).toBe('60');
  });

  it('only failures count: the right token passes many times', async () => {
    const ip = nextIp();
    for (let i = 0; i < 7; i++) expect((await call('GET', '/admin/reports', { ip })).status).toBe(200);
  });

  it('with no ADMIN_TOKEN configured nothing passes, not even an empty bearer', async () => {
    const e = { ...env, ADMIN_TOKEN: '' };
    expect((await call('GET', '/admin/reports', { token: '', e })).status).toBe(401);
    expect((await call('DELETE', '/admin/rooms/abcdefghij', { token: '', e })).status).toBe(401);
  });

  it('every admin route needs the token', async () => {
    expect((await call('POST', '/admin/reports/1/resolve', { token: null })).status).toBe(401);
    expect((await call('DELETE', '/admin/rooms/abcdefghij', { token: null })).status).toBe(401);
  });
});

describe('GET /api/admin/reports', () => {
  it('one row per target with reportCount, roomTitle, the snapshot and the newest reason; open by default', async () => {
    const a = await insertRoom({ title: '신고된 방' });
    await reportRoom(a, 1, 'spam');
    await reportRoom(a, 1, 'spam'); // duplicate, not counted
    await reportRoom(a, 2, 'illegal');
    await reportMessage(a, 1);
    const items = await list(undefined, a);
    expect(items).toHaveLength(2);
    const [msg, room] = items; // newest first
    expect(room).toMatchObject({ targetType: 'room', roomId: a, roomTitle: '신고된 방', messageId: null, messageSnapshot: null, reason: 'illegal', status: 'open', reportCount: 2 });
    expect(msg).toMatchObject({ targetType: 'message', messageId: 'm_test.1', reportCount: 1, messageSnapshot: { nickname: '느긋한 수달', text: '나쁜 말', sentAt: expect.any(Number), channel: 2 } });
    expect(Object.keys(room!).sort()).toEqual(['createdAt', 'id', 'messageId', 'messageSnapshot', 'reason', 'reportCount', 'roomId', 'roomTitle', 'status', 'targetType']);
  });

  it('pages of 50 by id, newest first, every target once', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) {
      const id = await insertRoom();
      ids.push(id);
      await reportRoom(id, 1);
    }
    const first: Page = await (await call('GET', '/admin/reports')).json();
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBe(String(first.items.at(-1)!.id));
    const items = await list('open', ...ids);
    expect(items.map((i) => i.roomId)).toEqual(ids.reverse());
  });

  it('400 on a bad status or cursor', async () => {
    expect((await call('GET', '/admin/reports?status=all')).status).toBe(400);
    expect((await call('GET', '/admin/reports?cursor=x')).status).toBe(400);
  });
});

describe('POST /api/admin/reports/:id/resolve', () => {
  it('204 and every open report on that target moves to resolved, with its count there', async () => {
    const a = await insertRoom();
    await reportRoom(a, 1);
    await reportRoom(a, 2);
    await reportMessage(a, 1);
    const [msg, room] = await list('open', a);
    expect((await call('POST', `/admin/reports/${room!.id}/resolve`)).status).toBe(204);
    expect((await list('open', a)).map((i) => i.id)).toEqual([msg!.id]);
    expect(await list('resolved', a)).toMatchObject([{ targetType: 'room', status: 'resolved', reportCount: 2 }]);
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE room_id = ? AND status = 'resolved' AND resolved_at IS NOT NULL").bind(a).first<{ n: number }>())!;
    expect(n).toBe(2);
    expect((await call('POST', `/admin/reports/${room!.id}/resolve`)).status).toBe(204); // already resolved
  });

  it('resolving an already resolved report leaves a newer open report on the same target alone (PR #38 review)', async () => {
    const a = await insertRoom();
    await reportRoom(a, 1);
    const [first] = await list('open', a);
    expect((await call('POST', `/admin/reports/${first!.id}/resolve`)).status).toBe(204);
    await reportRoom(a, 2); // a new report after the first was handled
    expect((await call('POST', `/admin/reports/${first!.id}/resolve`)).status).toBe(204);
    expect(await list('open', a)).toMatchObject([{ targetType: 'room', reportCount: 1 }]);
  });

  it('resolve closes the target up to the report shown, not one that came in after the list loaded (PR #39 review)', async () => {
    const a = await insertRoom();
    await reportRoom(a, 1);
    const [shown] = await list('open', a);
    await reportRoom(a, 2, 'illegal'); // arrives after the admin opened the list
    expect((await call('POST', `/admin/reports/${shown!.id}/resolve`)).status).toBe(204);
    expect(await list('open', a)).toMatchObject([{ reason: 'illegal', reportCount: 1 }]);
  });

  it('404 for an unknown report id', async () => {
    expect((await call('POST', '/admin/reports/999999999/resolve')).status).toBe(404);
    expect((await call('POST', '/admin/reports/abc/resolve')).status).toBe(404);
  });
});

describe('DELETE /api/admin/rooms/:id', () => {
  it('204; deleted_by admin, its open reports resolved, connected sockets get room_deleted {by: admin}', async () => {
    const a = await insertRoom();
    const other = await insertRoom();
    await reportRoom(a, 1);
    await reportMessage(a, 2);
    await reportRoom(other, 1);
    const p = await joinRoom(a, 1);
    expect((await call('DELETE', `/admin/rooms/${a}`)).status).toBe(204);
    expect(await p.next()).toEqual({ t: 'room_deleted', by: 'admin' });
    expect(await p.closed).toBe(CLOSE.roomDeleted);
    const row = await env.DB.prepare('SELECT deleted_at, deleted_by FROM rooms WHERE id = ?').bind(a).first();
    expect(row).toEqual({ deleted_at: expect.any(Number), deleted_by: 'admin' });
    expect(await list('open', a, other)).toMatchObject([{ roomId: other }]);
    expect(await list('resolved', a)).toHaveLength(2);
    expect((await app.request(`/api/rooms/${a}`, {}, env)).status).toBe(410);
  });

  it('410 for a room the owner deleted, and its open reports still resolve (PR #39 review)', async () => {
    const a = await insertRoom();
    await reportRoom(a, 1);
    await reportMessage(a, 2);
    await env.DB.prepare("UPDATE rooms SET deleted_at = 5000, deleted_by = 'owner' WHERE id = ?").bind(a).run();
    expect((await call('DELETE', `/admin/rooms/${a}`)).status).toBe(410);
    expect(await list('open', a)).toHaveLength(0);
    expect(await list('resolved', a)).toHaveLength(2);
    const row = await env.DB.prepare('SELECT deleted_by FROM rooms WHERE id = ?').bind(a).first();
    expect(row).toEqual({ deleted_by: 'owner' }); // who deleted it stays as it was
  });

  it('404 unknown, 410 already deleted', async () => {
    expect((await call('DELETE', '/admin/rooms/nosuchroom')).status).toBe(404);
    const gone = await insertRoom({ deletedAt: 5000 });
    expect((await call('DELETE', `/admin/rooms/${gone}`)).status).toBe(410);
  });
});
