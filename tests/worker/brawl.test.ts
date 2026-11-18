// T016 (quickstart 2): the room DO runs the brawl with fake sockets and the real clock.
import { evictDurableObject } from 'cloudflare:test';
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
// Skips what the test does not look at (peer moves and joins).
async function nextOf<T extends ServerMessage['t']>(c: Client, t: T): Promise<Extract<ServerMessage, { t: T }>> {
  for (;;) {
    const m = await c.next();
    if (m.t === t) return m as Extract<ServerMessage, { t: T }>;
  }
}

// a and b in channel 1's arena, a facing east with b a metre in front.
async function duel() {
  const roomId = await insertRoom();
  const a = await joinRoom(roomId, 1);
  const b = await joinRoom(roomId, 2);
  await wait(1000); // walk to the entrance at under 8 m/s
  for (const c of [a, b]) {
    c.send({ t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' });
    await nextOf(c, 'correction');
  }
  const at = startPoint(arena, 0);
  await wait(200);
  a.send({ t: 'move', p: at, r: Math.PI / 2, a: 'idle' });
  await wait(2000); // b walks 14 m from its start
  b.send({ t: 'move', p: [at[0] + 1, at[1], at[2]], r: -Math.PI / 2, a: 'idle' });
  await nextOf(a, 'peer_moved');
  await nextOf(a, 'peer_moved');
  return { roomId, a, b };
}

describe('room DO brawl (FR-013, FR-031, FR-034, R2, R6)', { timeout: 20_000 }, () => {
  it('nobody gets hit in the peace zone', async () => {
    const roomId = await insertRoom();
    const a = await joinRoom(roomId, 1);
    const b = await joinRoom(roomId, 2);
    await a.next(); // peer_joined
    a.send({ t: 'skill', k: 'jab' });
    a.send({ t: 'chat', text: 'after' });
    expect((await b.next()).t).toBe('chat');
  });

  it('a jab reaches both; a second one in the cooldown is ignored; the landing comes from the alarm', async () => {
    const { a, b } = await duel();
    a.send({ t: 'skill', k: 'jab', nonce: 'n1' });
    a.send({ t: 'skill', k: 'jab', nonce: 'n2' });
    const swing = await nextOf(b, 'swing');
    expect(swing.hits).toEqual([expect.objectContaining({ peerId: b.welcome.you.peerId, damage: 3 })]);
    expect((await nextOf(a, 'swing')).nonce).toBe('n1');
    // Nobody sends anything: the alarm at the landing time delivers it.
    expect(await nextOf(b, 'landed')).toMatchObject({ peerId: b.welcome.you.peerId, end: 'land' });
    a.send({ t: 'chat', text: 'no second swing' });
    const seen: string[] = [];
    for (let m = await a.next(); m.t !== 'chat'; m = await a.next()) seen.push(m.t);
    expect(seen).not.toContain('swing');
  });

  it('keeps the damage in the attachment, so it survives the DO being rebuilt', async () => {
    const { roomId, a, b } = await duel();
    a.send({ t: 'skill', k: 'jab' });
    await nextOf(b, 'swing');
    await evictDurableObject(env.ROOM.getByName(roomId));
    const c = await joinRoom(roomId, 3);
    expect(c.welcome.arena.fighters).toEqual(expect.arrayContaining([expect.objectContaining({ peerId: b.welcome.you.peerId, damage: 3 })]));
  });
});
