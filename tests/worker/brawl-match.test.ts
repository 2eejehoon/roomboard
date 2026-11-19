// T045 (R6, FR-025~027, FR-040): the room DO writes a running match to arena:<channel> at once and keeps it across a rebuild.
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function nextOf<T extends ServerMessage['t']>(c: Client, t: T): Promise<Extract<ServerMessage, { t: T }>> {
  for (;;) {
    const m = await c.next();
    if (m.t === t) return m as Extract<ServerMessage, { t: T }>;
  }
}
const room = (roomId: string) => env.ROOM.getByName(roomId);
const stored = (roomId: string) => runInDurableObject(room(roomId), (_o, state) => state.storage.get<{ match?: { endsAt: number } }>('arena:1'));

// a and b in the arena (two starts), a match running between them.
async function running() {
  const roomId = await insertRoom();
  const a = await joinRoom(roomId, 1);
  const b = await joinRoom(roomId, 2);
  await wait(1000);
  for (const c of [a, b]) {
    c.send({ t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' });
    await nextOf(c, 'correction');
  }
  a.send({ t: 'match_start' });
  const start = await nextOf(b, 'match');
  return { roomId, a, b, start };
}

describe('room DO match storage (R6, FR-025~027)', { timeout: 20_000 }, () => {
  it('a started match is in arena:<channel> at once (no 2 s wait) and survives the DO being rebuilt', async () => {
    const { roomId, start } = await running();
    expect(start).toMatchObject({ state: 'running', players: [{ stocks: 3 }, { stocks: 3 }] });
    await expect.poll(() => stored(roomId), { timeout: 1000 }).toMatchObject({ blocks: [], match: { endsAt: start.state === 'running' && start.endsAt } });
    await evictDurableObject(room(roomId));
    const c = await joinRoom(roomId, 3);
    expect(c.welcome.arena.match).toMatchObject({ state: 'running', endsAt: start.state === 'running' && start.endsAt });
  });

  it('a knock-out writes the stocks at once; the time-limit alarm ends it, sends the result and drops the match', async () => {
    const { roomId, a, b } = await running();
    const [x, , z] = startPoint(arena, 1);
    b.send({ t: 'move', p: [x, arena.koY - 0.5, z], r: 0, a: 'jump' });
    expect(await nextOf(a, 'knocked_out')).toMatchObject({ stocks: 2, out: false });
    await expect.poll(async () => (await stored(roomId))?.match, { timeout: 1000 }).toMatchObject({ players: [{ stocks: 3 }, { stocks: 2 }] });
    // The 5-minute limit, moved to now: the stored match after a wake brings its own alarm back.
    await runInDurableObject(room(roomId), async (_o, state) => {
      const rec = (await state.storage.get<{ blocks: unknown[]; match: { endsAt: number } }>('arena:1'))!;
      await state.storage.put('arena:1', { ...rec, match: { ...rec.match, endsAt: Date.now() } });
    });
    await evictDurableObject(room(roomId));
    await runInDurableObject(room(roomId), (_o, state) => state.storage.setAlarm(Date.now()));
    expect(await runDurableObjectAlarm(room(roomId))).toBe(true);
    const ended = await nextOf(b, 'match');
    expect(ended).toMatchObject({ state: 'ended', ranks: [{ rank: 1 }, { rank: 2 }] });
    expect(await stored(roomId), 'no blocks and no match: the key is gone').toBeUndefined();
  });

  it('the admin reset cancels a running match before arena_reset (FR-040)', async () => {
    const { roomId, b } = await running();
    await room(roomId).resetArenas();
    const order: string[] = [];
    for (;;) {
      const m = await b.next();
      if (m.t === 'match' || m.t === 'arena_reset') order.push(m.t === 'match' ? `match:${m.state}` : m.t);
      if (m.t === 'arena_reset') break;
    }
    expect(order).toEqual(['match:cancelled', 'arena_reset']);
    expect(await stored(roomId)).toBeUndefined();
  });
});
