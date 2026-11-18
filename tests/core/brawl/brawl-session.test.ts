// T015: one channel's brawl through RoomSession, with a fake clock.
import { describe, expect, it } from 'vitest';
import { makeArena, startPoint } from '../../../src/core/brawl/arena.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';
import { createChatFilter } from '../../../src/core/chat-filter.ts';
import type { ServerMessage } from '../../../src/core/protocol.ts';
import { createRoomData } from '../../../src/core/room-data.ts';
import { RoomSession, type Outbox } from '../../../src/core/room-session.ts';
import { THEMES } from '../../../src/core/themes.ts';

const arena = makeArena(TUNING);
const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ex, , ez] = THEMES.cafe.arenaEntrance;
const EAST = Math.PI / 2;
const msgs = <T extends ServerMessage['t']>(out: Outbox, peerId: string, t: T) =>
  out.send.filter((s) => s.to === peerId && s.msg.t === t).map((s) => s.msg as Extract<ServerMessage, { t: T }>);
const send = (s: RoomSession, id: string, m: object, now: number) => s.receive(id, JSON.stringify(m), now);

// a and b in the arena, a at `at` facing east, b one metre east of a. The clock is past 10 s so every walk is allowed.
async function duel(at: [number, number, number] = [30.5, 1, 4.5], others: string[] = []) {
  const s = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
  for (const [i, id] of ['a', 'b', ...others].entries()) {
    s.connect(id);
    await send(s, id, { t: 'join', v: 2, deviceKey: key(i + 1) }, 0);
    await send(s, id, { t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' }, 2000);
  }
  await send(s, 'a', { t: 'move', p: at, r: EAST, a: 'idle' }, 10_000);
  await send(s, 'b', { t: 'move', p: [at[0] + 1, at[1], at[2]], r: -EAST, a: 'idle' }, 10_000);
  return s;
}

describe('BrawlSession: jab, flight, landing (FR-031, R2, R4)', () => {
  it('a jab sends swing to the channel, the nonce only to the attacker, and launches b after the hitstop', async () => {
    const s = await duel();
    const out = await send(s, 'a', { t: 'skill', k: 'jab', nonce: 's7' }, 20_000);
    const [mine] = msgs(out, 'a', 'swing');
    const [theirs] = msgs(out, 'b', 'swing');
    expect(mine).toEqual({ ...theirs, nonce: 's7' });
    expect(theirs).toEqual({
      t: 'swing',
      peerId: 'a',
      k: 'jab',
      step: 1,
      at: 20_000,
      hitstopMs: 35,
      readyAt: 20_000 + 35 + 350,
      hits: [{ peerId: 'b', damage: 3, guarded: false, hitstopMs: 35, launch: { t: 20_035, p: [31.5, 1, 4.5], v: [0.78, 0, 0], s: 1.3, cause: 'hit' } }],
    });
  });

  it('a whiff is an empty hits list and readyAt without a hitstop', async () => {
    const s = await duel();
    await send(s, 'b', { t: 'move', p: [34.5, 1, 4.5], r: 0, a: 'walk' }, 15_000);
    const [swing] = msgs(await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000), 'b', 'swing');
    expect(swing).toMatchObject({ hits: [], hitstopMs: 0, readyAt: 20_350 });
  });

  it('while flying, b moves are ignored (no peer_moved, no exit) and the landing comes as an event', async () => {
    const s = await duel();
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    const flying = await send(s, 'b', { t: 'move', p: [31.6, 1, 4.5], r: 0, a: 'walk', d: [1, 0] }, 20_040);
    expect(flying.send).toEqual([]);
    const landAt = s.nextEventAt()!;
    expect(landAt).toBeGreaterThan(20_035);
    expect(s.runEvents(landAt - 1).send).toEqual([]);
    const [landed] = msgs(s.runEvents(landAt), 'a', 'landed');
    expect(landed).toMatchObject({ peerId: 'b', end: 'land' });
    expect(landed.p[0]).toBeCloseTo(31.5 + 0.78 ** 2 / 12, 2);
    expect(s.participant('b')?.pose.p).toEqual(landed.p);
    expect(s.nextEventAt()).toBeNull();
  });

  it('ignores a jab in the cooldown or out of reach (FR-034) and from the peace zone (FR-013)', async () => {
    const s = await duel();
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    expect((await send(s, 'a', { t: 'skill', k: 'jab' }, 20_100)).send).toEqual([]);
    const peace = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
    for (const [i, id] of ['a', 'b'].entries()) {
      peace.connect(id);
      await send(peace, id, { t: 'join', v: 2, deviceKey: key(i + 1) }, 0);
    }
    expect((await send(peace, 'a', { t: 'skill', k: 'jab' }, 5000)).send).toEqual([]);
  });

  it('judges a hit from the flight position now, not the last move', async () => {
    const s = await duel();
    await send(s, 'a', { t: 'skill', k: 'smash' }, 20_000);
    // b flies far east; a jab where b stood misses.
    const [swing] = msgs(await send(s, 'a', { t: 'skill', k: 'jab' }, 21_000), 'a', 'swing');
    expect(swing.hits).toEqual([]);
  });
});

describe('BrawlSession: knock-out and respawn (FR-005, FR-006)', () => {
  it('a smash off the edge knocks out at koY, then respawns 3 s later at a start at 0%', async () => {
    const s = await duel([41.5, 1, 4.5]);
    const swing = msgs(await send(s, 'a', { t: 'skill', k: 'smash' }, 20_000), 'a', 'swing')[0];
    expect(swing.hits[0]).toMatchObject({ damage: 12, launch: { s: 20.4 } });
    const koAt = s.nextEventAt()!;
    const [ko] = msgs(s.runEvents(koAt), 'b', 'knocked_out');
    expect(ko).toEqual({ t: 'knocked_out', peerId: 'b', respawnAt: Math.round(koAt) + 3000, stocks: null, out: false, at: Math.round(koAt) });
    expect((await send(s, 'b', { t: 'skill', k: 'jab' }, koAt + 100)).send).toEqual([]);
    expect(s.nextEventAt()).toBe(Math.round(koAt) + 3000);
    const [back] = msgs(s.runEvents(Math.round(koAt) + 3000), 'a', 'respawned');
    expect(back).toEqual({ t: 'respawned', peerId: 'b', p: startPoint(arena, 1), at: Math.round(koAt) + 3000 });
    expect(s.participant('b')?.fighter).toMatchObject({ damage: 0, flight: null, knockedOutAt: null });
    expect(s.participant('b')?.pose.p).toEqual(startPoint(arena, 1));
  });

  it('walking off the edge knocks out by the height the client sends (R4 shortcut)', async () => {
    const s = await duel();
    const out = await send(s, 'b', { t: 'move', p: [31.5, arena.koY - 0.5, 4.5], r: 0, a: 'jump' }, 21_000);
    expect(msgs(out, 'a', 'knocked_out')[0]).toMatchObject({ peerId: 'b', respawnAt: 24_000 });
  });
});

describe('BrawlSession: counter window (US1-7)', () => {
  it('at 100% a jabbed fighter can act at least 80 ms before the attacker’s next jab', async () => {
    const s = await duel();
    s.participant('b')!.fighter!.damage = 100;
    const [swing] = msgs(await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000), 'a', 'swing');
    expect(swing.hits[0].damage).toBe(103);
    expect(s.participant('b')!.fighter!.stunUntil).toBeLessThanOrEqual(swing.readyAt - 80);
  });

  it('guard in front cuts the jab to 0.212; a throw goes through the guard', async () => {
    const s = await duel();
    await send(s, 'b', { t: 'guard', on: true }, 19_000);
    const [jab] = msgs(await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000), 'a', 'swing');
    expect(jab.hits[0]).toMatchObject({ guarded: true, damage: 1, launch: { s: 0.212 } });
    const [thrown] = msgs(await send(s, 'a', { t: 'skill', k: 'throw' }, 25_000), 'a', 'swing');
    expect(thrown.hits[0]).toMatchObject({ guarded: false, damage: 11 });
  });

  it('a roll makes the fighter untouchable for 300 ms', async () => {
    const s = await duel();
    await send(s, 'b', { t: 'roll', d: [0, 1] }, 19_900);
    expect(msgs(await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000), 'a', 'swing')[0].hits).toEqual([]);
  });
});
