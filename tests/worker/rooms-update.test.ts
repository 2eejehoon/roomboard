import { evictDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createRoomData } from '../../src/core/room-data.ts';
import { insertRoom, joinRoom } from './rooms-helpers.ts';

// T079: PATCH /api/rooms/:id (contracts/openapi.yaml, quickstart Q11). Each request gets its own client IP so the password
// limit (5 per 60 s) only bites where a test means it to.
const PASSWORD = 'owner-pass';
let ipSeq = 0;
const patch = (id: string, body: unknown, ip = `198.51.100.${++ipSeq}`) =>
  exports.default.fetch(`https://roomboard.test/api/rooms/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
const row = (id: string) => env.DB.prepare('SELECT title, description, theme_id, room_data, updated_at FROM rooms WHERE id = ?').bind(id).first<Record<string, unknown>>();

describe('PATCH /api/rooms/:id', () => {
  it('200 with the Room; updated_at moves, the title is filtered, room_data stays without a theme change', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const res = await patch(id, { password: PASSWORD, title: '바보 같은 새 제목' });
    expect(res.status).toBe(200);
    const room = await res.json<Record<string, unknown>>();
    expect(room).toMatchObject({ id, title: '** 같은 새 제목', description: '설명', themeId: 'cafe', roomData: createRoomData('cafe') });
    const saved = await row(id);
    expect(saved).toMatchObject({ title: '** 같은 새 제목', theme_id: 'cafe' });
    expect(saved!.updated_at).toBeGreaterThan(2000);
    expect(room.updatedAt).toBe(saved!.updated_at);
  });

  it('a theme change resets room_data to the new theme defaults', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const res = await patch(id, { password: PASSWORD, themeId: 'library' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ themeId: 'library', roomData: createRoomData('library') });
    expect(await row(id)).toMatchObject({ theme_id: 'library', room_data: JSON.stringify(createRoomData('library')) });
  });

  it('sends room_updated to everyone connected, also after the DO hibernated; the next joiner gets the new room and spawn', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const a = await joinRoom(id, 1);
    const b = await joinRoom(id, 2);
    await a.next(); // peer_joined
    await evictDurableObject(env.ROOM.getByName(id));
    expect((await patch(id, { password: PASSWORD, title: '바뀐 제목', themeId: 'garden' })).status).toBe(200);
    const updated = { t: 'room_updated', room: { id, title: '바뀐 제목', description: '설명', roomData: createRoomData('garden') } };
    expect(await a.next()).toEqual(updated);
    expect(await b.next()).toEqual(updated);
    await evictDurableObject(env.ROOM.getByName(id)); // the reset poses must be in the socket attachments too
    const c = await joinRoom(id, 3);
    expect(c.welcome.room).toEqual(updated.room);
    expect(c.welcome.spawn).toEqual([0, 0, 8]);
    expect(c.welcome.peers.map((p) => p.p)).toEqual([[0, 0, 8], [0, 0, 8]]);
  });

  it('403 wrong_password and nothing changes', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const res = await patch(id, { password: 'not-the-pass', title: '몰래 바꾼 제목' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'wrong_password' });
    expect(await row(id)).toMatchObject({ title: '테스트 방', updated_at: 2000 });
  });

  it('400 with only the password, or an invalid field', async () => {
    const id = await insertRoom({ password: PASSWORD });
    expect((await patch(id, { password: PASSWORD })).status).toBe(400);
    const res = await patch(id, { password: PASSWORD, title: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation', fields: { title: 'field.title' } });
  });

  it('404 for an unknown room, 410 for a deleted one', async () => {
    expect((await patch('nosuchroom', { password: PASSWORD, title: 'x' })).status).toBe(404);
    const gone = await insertRoom({ password: PASSWORD, deletedAt: 3000 });
    expect((await patch(gone, { password: PASSWORD, title: 'x' })).status).toBe(410);
  });

  it('the 6th attempt from one IP within 60 s is 429 with Retry-After', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const ip = '198.51.100.250';
    for (let i = 0; i < 5; i++) expect((await patch(id, { password: 'wrong-pass', title: 'x' }, ip)).status).toBe(403);
    const res = await patch(id, { password: PASSWORD, title: 'x' }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ code: 'rate_limited', retryAfterMs: 60_000 });
  });
});
