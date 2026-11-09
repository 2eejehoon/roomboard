import { evictDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CLOSE } from '../../src/core/protocol.ts';
import { insertRoom, joinRoom } from './rooms-helpers.ts';

// T080: DELETE /api/rooms/:id (contracts/openapi.yaml, websocket.md room_deleted, quickstart Q11).
const PASSWORD = 'owner-pass';
let ipSeq = 0;
const del = (id: string, password: string) =>
  exports.default.fetch(`https://roomboard.test/api/rooms/${id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `192.0.2.${++ipSeq}` },
    body: JSON.stringify({ password }),
  });
const get = (path: string) => exports.default.fetch(`https://roomboard.test/api/${path}`);

describe('DELETE /api/rooms/:id', () => {
  it('204; soft delete by owner; then GET is 410 and the board leaves it out', async () => {
    const id = await insertRoom({ password: PASSWORD, createdAt: Date.now() + 10 ** 9 }); // newest, so on the first page
    const res = await del(id, PASSWORD);
    expect(res.status).toBe(204);
    const row = await env.DB.prepare('SELECT deleted_at, deleted_by FROM rooms WHERE id = ?').bind(id).first<{ deleted_at: number; deleted_by: string }>();
    expect(row).toEqual({ deleted_at: expect.any(Number), deleted_by: 'owner' });
    expect((await get(`rooms/${id}`)).status).toBe(410);
    const { items } = await (await get('rooms?limit=50')).json<{ items: { id: string }[] }>();
    expect(items.map((r) => r.id)).not.toContain(id);
  });

  it('tells everyone connected room_deleted {by: owner}, then closes them with 4001, also after the DO hibernated', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const a = await joinRoom(id, 1);
    const b = await joinRoom(id, 2);
    await a.next(); // peer_joined
    await evictDurableObject(env.ROOM.getByName(id));
    expect((await del(id, PASSWORD)).status).toBe(204);
    for (const c of [a, b]) {
      expect(await c.next()).toEqual({ t: 'room_deleted', by: 'owner' });
      expect(await c.closed).toBe(CLOSE.roomDeleted);
    }
  });

  it('403 wrong_password and the room stays', async () => {
    const id = await insertRoom({ password: PASSWORD });
    const res = await del(id, 'not-the-pass');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'wrong_password' });
    expect((await get(`rooms/${id}`)).status).toBe(200);
  });
});
