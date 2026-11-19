// T035 (R6, R9, FR-018): the room DO keeps a channel's built blocks in storage arena:<channel> while someone is there.
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { makeArena, startPoint } from '../../src/core/brawl/arena.ts';
import { TUNING } from '../../src/core/brawl/tuning.ts';
import type { ServerMessage } from '../../src/core/protocol.ts';
import { THEMES } from '../../src/core/themes.ts';
import { insertRoom, joinRoom, type Client } from './rooms-helpers.ts';

const arena = makeArena(TUNING);
const [ex, , ez] = THEMES.cafe.arenaEntrance;
const CLEANUP_MS = 10 * 60_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function nextOf<T extends ServerMessage['t']>(c: Client, t: T): Promise<Extract<ServerMessage, { t: T }>> {
  for (;;) {
    const m = await c.next();
    if (m.t === t) return m as Extract<ServerMessage, { t: T }>;
  }
}
const stored = (roomId: string, key = 'arena:1') => runInDurableObject(env.ROOM.getByName(roomId), (_o, state) => state.storage.get(key));
const alarmAt = (roomId: string) => runInDurableObject(env.ROOM.getByName(roomId), (_o, state) => state.storage.getAlarm());

// a at the first start facing east, b watching from the peace zone; both in channel 1.
async function builder() {
  const roomId = await insertRoom();
  const a = await joinRoom(roomId, 1);
  const b = await joinRoom(roomId, 2);
  await wait(1000);
  a.send({ t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' });
  await nextOf(a, 'correction');
  a.send({ t: 'move', p: startPoint(arena, 0), r: Math.PI / 2, a: 'idle' });
  await nextOf(b, 'peer_moved');
  await nextOf(b, 'peer_moved');
  return { roomId, a, b };
}

describe('room DO arena storage (R6, FR-018)', { timeout: 20_000 }, () => {
  it('a placed block reaches the channel, is written within 2 s with a cleanup alarm, and survives the DO being rebuilt', async () => {
    const { roomId, a, b } = await builder();
    a.send({ t: 'block', op: 'place', kind: 'dirt', h: 0 });
    const block = await nextOf(b, 'block');
    expect(block).toMatchObject({ cell: [5, 1, 4], kind: 'dirt', hp: 1 });
    await wait(2500);
    expect(await stored(roomId)).toEqual({ blocks: [[[5, 1, 4], 'dirt', 1]] });
    const at = await alarmAt(roomId);
    expect(at).not.toBeNull();
    expect(at!).toBeLessThanOrEqual(Date.now() + CLEANUP_MS);
    await evictDurableObject(env.ROOM.getByName(roomId));
    const c = await joinRoom(roomId, 3);
    expect(c.welcome.arena.blocks).toEqual([[[5, 1, 4], 'dirt', 1]]);
  });

  it('the last one out of the channel deletes its key', async () => {
    const { roomId, a, b } = await builder();
    a.send({ t: 'block', op: 'place', kind: 'dirt', h: 0 });
    await nextOf(b, 'block');
    await wait(2500);
    expect(await stored(roomId)).toBeDefined();
    a.ws.close();
    b.ws.close();
    await expect.poll(() => stored(roomId), { timeout: 5000 }).toBeUndefined();
  });

  it('with no socket left (no close event), the cleanup alarm deletes the key and is not set again', async () => {
    const roomId = await insertRoom();
    await runInDurableObject(env.ROOM.getByName(roomId), async (_o, state) => {
      await state.storage.put('arena:1', { blocks: [[[5, 1, 4], 'dirt', 1]] });
      await state.storage.setAlarm(Date.now());
    });
    expect(await runDurableObjectAlarm(env.ROOM.getByName(roomId))).toBe(true);
    expect(await stored(roomId)).toBeUndefined();
    expect(await alarmAt(roomId)).toBeNull();
  });

  it('a room deleted before its blocks are written does not keep the alarm ringing (PR #91 review)', async () => {
    const { roomId, a, b } = await builder();
    a.send({ t: 'block', op: 'place', kind: 'dirt', h: 0 });
    await nextOf(b, 'block');
    await env.ROOM.getByName(roomId).roomDeleted('owner');
    await wait(3000);
    expect(await alarmAt(roomId)).toBeNull();
    expect(await stored(roomId)).toBeUndefined();
  });

  it('a block request over 4 a second is rate_limited {scope: block}', async () => {
    const { a } = await builder();
    for (let i = 0; i < 5; i++) a.send({ t: 'block', op: 'break', h: -1 });
    expect(await nextOf(a, 'rate_limited')).toMatchObject({ scope: 'block' });
  });
});
