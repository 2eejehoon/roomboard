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
      // r is kept to 2 decimals (1.57), so the push is a hair off +x.
      hits: [{ peerId: 'b', damage: 3, guarded: false, hitstopMs: 35, launch: { t: 20_035, p: [31.5, 1, 4.5], v: [0.78, 0, 0.001], s: 1.3, cause: 'hit' } }],
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
    expect(Math.abs(landed.p[0] - 31.5 - 0.78 ** 2 / 12)).toBeLessThan(0.013);
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

  it('walking off the side of the island falls freely (no correction) until koY, then knocks out (PR #87 review)', async () => {
    const s = await duel([20.5, 1, 4.5]);
    expect((await send(s, 'a', { t: 'move', p: [19.6, 0.5, 4.5], r: 0, a: 'jump' }, 20_100)).send.map((m) => m.msg.t)).not.toContain('correction');
    expect((await send(s, 'a', { t: 'move', p: [19.4, -4, 4.5], r: 0, a: 'jump' }, 21_000)).send.map((m) => m.msg.t)).not.toContain('correction');
    const out = await send(s, 'a', { t: 'move', p: [19.3, arena.koY - 0.5, 4.5], r: 0, a: 'jump' }, 21_800);
    expect(msgs(out, 'b', 'knocked_out')[0]).toMatchObject({ peerId: 'a' });
  });

  it('a real free fall off the edge (9.81 m/s², a move every 200 ms) is never corrected and ends in a knock-out (PR #87 review)', async () => {
    const s = await duel([20.5, 1, 4.5]);
    const seen: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const t = i * 0.2;
      const out = await send(s, 'a', { t: 'move', p: [19.5, 1 - 0.5 * 9.81 * t * t, 4.5], r: 0, a: 'jump' }, 20_000 + i * 200);
      seen.push(...out.send.filter((m) => m.to === 'a').map((m) => m.msg.t));
      if (seen.includes('knocked_out')) break;
    }
    expect(seen).not.toContain('correction');
    expect(seen).toContain('knocked_out');
  });

  it('a fighter cannot walk from the arena into the room: the room is reached only through the exit (R5, PR #87 review)', async () => {
    const s = await duel([20.5, 1, 4.5]);
    await send(s, 'a', { t: 'move', p: [12, 0, 4.5], r: 0, a: 'walk' }, 22_000);
    const out = await send(s, 'a', { t: 'move', p: [5.5, 0, 4], r: 0, a: 'walk' }, 24_000);
    expect(msgs(out, 'a', 'correction')).toHaveLength(1);
    expect(s.participant('a')?.fighter).toBeDefined();
  });

  it('nobody outside the arena box is hit or hits (FR-013), even with a fighter state', async () => {
    const s = await duel();
    s.participant('b')!.pose.p = [12, 0, 4.5];
    s.participant('a')!.pose.p = [11, 0, 4.5];
    expect((await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000)).send).toEqual([]);
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

describe('BrawlSession: theme change (FR-013, PR #84 review)', () => {
  it('a theme change sends fighters to the peace-zone spawn unarmed: no fighters in welcome, nothing to hit', async () => {
    const s = await duel();
    s.update({ ...room, roomData: createRoomData('library') }, true, 30_000);
    s.connect('c');
    const welcome = msgs(await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 30_100), 'c', 'welcome')[0];
    expect(welcome.arena.fighters).toEqual([]);
    expect((await send(s, 'a', { t: 'skill', k: 'jab' }, 30_200)).send).toEqual([]);
    expect(s.participant('b')?.fighter).toBeUndefined();
  });
});

describe('BrawlSession: blocks (US3, FR-015~017, FR-034, R9)', () => {
  // a at [30.5, 1, 4.5] (cell [10, 1, 4]) facing east, b moved out of the way.
  const builder = async () => {
    const s = await duel();
    await send(s, 'b', { t: 'move', p: [34.5, 1, 9.5], r: 0, a: 'walk' }, 15_000);
    return s;
  };

  it('places a block in front for the whole channel and in welcome; an occupied cell is ignored', async () => {
    const s = await builder();
    const out = await send(s, 'a', { t: 'block', op: 'place', kind: 'dirt', h: 0 }, 20_000);
    for (const id of ['a', 'b']) expect(msgs(out, id, 'block')).toEqual([{ t: 'block', cell: [11, 1, 4], kind: 'dirt', hp: 1, at: 20_000 }]);
    expect((await send(s, 'a', { t: 'block', op: 'place', kind: 'stone', h: 0 }, 21_000)).send).toEqual([]);
    s.connect('c');
    const [welcome] = msgs(await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 22_000), 'c', 'welcome');
    expect(welcome.arena.blocks).toEqual([[[11, 1, 4], 'dirt', 1]]);
  });

  it('breaks the floor in front below in four hits, then nothing is left to hit', async () => {
    const s = await builder();
    const hps = [];
    for (let i = 0; i < 5; i++) hps.push(...msgs(await send(s, 'a', { t: 'block', op: 'break', h: -1 }, 20_000 + i * 1000), 'b', 'block').map((m) => [m.kind, m.hp]));
    expect(hps).toEqual([['stone', 3], ['stone', 2], ['stone', 1], [null, 0]]);
  });

  it('nothing from the peace zone or onto a body, and over 4 a second is rate_limited {scope: block} to the sender only', async () => {
    const s = await builder();
    await send(s, 'b', { t: 'move', p: [31.5, 1, 4.5], r: 0, a: 'walk' }, 16_000);
    expect((await send(s, 'a', { t: 'block', op: 'place', kind: 'dirt', h: 0 }, 20_000)).send, 'b stands there').toEqual([]);
    const outs = [];
    for (let i = 0; i < 5; i++) outs.push(await send(s, 'a', { t: 'block', op: 'break', h: -1 }, 21_000));
    expect(outs.slice(0, 4).every((o) => msgs(o, 'b', 'block').length === 1)).toBe(true);
    expect(outs[4].send).toEqual([{ to: 'a', msg: { t: 'rate_limited', scope: 'block', retryAfterMs: 250 } }]);
    s.connect('c');
    await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 30_000);
    expect((await send(s, 'c', { t: 'block', op: 'break', h: -1 }, 31_000)).send).toEqual([]);
  });
});

describe('BrawlSession: walls (US3 scenarios 3~5, FR-019)', () => {
  // b with its back 3 cm from a dirt wall at x = 32 (cell [12, 1, 4]); a jab at 0% slides about 5 cm (strength 1.3).
  const walled = async () => {
    const s = await duel([30.9, 1, 4.5]);
    await send(s, 'b', { t: 'move', p: [34.5, 1, 9.5], r: 0, a: 'walk' }, 15_000);
    await send(s, 'a', { t: 'move', p: [30.9, 1, 4.5], r: EAST, a: 'idle' }, 15_500);
    // a places the wall from [31.5, ...]: cell [11, ...] facing east puts it at [12, 1, 4].
    await send(s, 'a', { t: 'move', p: [31.5, 1, 4.5], r: EAST, a: 'idle' }, 16_000);
    await send(s, 'a', { t: 'block', op: 'place', kind: 'dirt', h: 0 }, 16_100);
    await send(s, 'a', { t: 'move', p: [30.9, 1, 4.5], r: EAST, a: 'idle' }, 16_500);
    await send(s, 'b', { t: 'move', p: [31.97, 1, 4.5], r: -EAST, a: 'walk' }, 17_000);
    return s;
  };

  it('a weak hit into dirt bounces back with extra damage as a new launch {cause: wall}', async () => {
    const s = await walled();
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    const wallAt = s.nextEventAt()!;
    const [launch] = msgs(s.runEvents(wallAt), 'a', 'launch');
    expect(launch).toMatchObject({ peerId: 'b', launch: { p: [32, 1, 4.5], s: 0.65, cause: 'wall' }, wall: { result: 'bounce', damage: 4, cell: [12, 1, 4] } });
    expect(launch.launch.v[0]).toBeLessThan(0);
    expect(s.participant('b')!.fighter!.damage).toBeCloseTo(3.65);
  });

  it('a guard press just before the wall techs: landed {end: tech}, no extra damage, hitstun over', async () => {
    const s = await walled();
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    await send(s, 'b', { t: 'guard', on: true }, 20_020);
    const wallAt = s.nextEventAt()!;
    const [landed] = msgs(s.runEvents(wallAt), 'a', 'landed');
    expect(landed).toMatchObject({ peerId: 'b', end: 'tech' });
    expect(landed.p.slice(0, 2)).toEqual([32, 1]);
    expect(s.participant('b')!.fighter!).toMatchObject({ damage: 3, flight: null, stunUntil: landed.at });
  });

  it('a smash breaks the dirt and flies on; the block is gone for a newcomer, with no block message', async () => {
    const s = await walled();
    await send(s, 'a', { t: 'hold', k: 'smash' }, 19_900);
    await send(s, 'a', { t: 'skill', k: 'smash' }, 20_000);
    const out = s.runEvents(s.nextEventAt()!);
    expect(msgs(out, 'a', 'launch')[0]).toMatchObject({ peerId: 'b', launch: { cause: 'wall' }, wall: { result: 'break', cell: [12, 1, 4] } });
    expect(msgs(out, 'a', 'block')).toEqual([]);
    s.connect('c');
    const [welcome] = msgs(await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 20_500), 'c', 'welcome');
    expect(welcome.arena.blocks).toEqual([]);
  });

  it('a block placed on a flying fighter’s path relaunches it from where it is now {cause: block}', async () => {
    // b flies east along z 4 from a full smash (32.4, about y 2.5 at x 34); c builds at eye height in [14, 2, 4], ahead of it.
    const s = await duel([30.5, 1, 4.5], ['c']);
    await send(s, 'c', { t: 'move', p: [33.5, 1, 4.5], r: EAST, a: 'walk' }, 15_000);
    await send(s, 'a', { t: 'hold', k: 'smash' }, 19_000);
    await send(s, 'a', { t: 'skill', k: 'smash' }, 20_000);
    const before = s.nextEventAt()!;
    const out = await send(s, 'c', { t: 'block', op: 'place', kind: 'stone', h: 1 }, 20_200);
    const [relaunch] = msgs(out, 'a', 'launch');
    expect(relaunch).toMatchObject({ peerId: 'b', at: 20_200, launch: { t: 20_200, cause: 'block' } });
    expect(s.nextEventAt()).not.toBe(before);
  });

  it('a block that is not on any path relaunches nobody', async () => {
    const s = await duel();
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    s.connect('c');
    await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 20_005);
    await send(s, 'c', { t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' }, 20_006);
    await send(s, 'c', { t: 'move', p: [24.5, 1, 20.5], r: 0, a: 'walk' }, 20_007);
    const out = await send(s, 'c', { t: 'block', op: 'place', kind: 'dirt', h: 0 }, 20_010);
    expect(msgs(out, 'a', 'launch')).toEqual([]);
  });
});

describe('RoomSession.resetArenas (FR-040, R10)', () => {
  it('clears every channel’s blocks; arena people respawn at a start at 0% after arena_reset; the peace zone only hears it', async () => {
    const s = await duel();
    await send(s, 'a', { t: 'block', op: 'break', h: -1 }, 19_000);
    await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000);
    s.connect('c');
    await send(s, 'c', { t: 'join', v: 2, deviceKey: key(9) }, 20_100);
    const out = s.resetArenas(21_000);
    expect(out.send.filter((m) => m.to === 'b').map((m) => m.msg.t)).toEqual(['arena_reset', 'respawned', 'respawned']);
    // c in the peace zone sees the arena too: it hears the same, but stays where it is.
    expect(out.send.filter((m) => m.to === 'c').map((m) => m.msg.t)).toEqual(['arena_reset', 'respawned', 'respawned']);
    expect(s.participant('c')!.pose.p).toEqual(THEMES.cafe.spawn);
    expect(s.participant('b')!.fighter).toMatchObject({ damage: 0, flight: null });
    expect(arena.starts.map((_, i) => startPoint(arena, i))).toContainEqual(s.participant('b')!.pose.p);
    s.connect('d');
    const [welcome] = msgs(await send(s, 'd', { t: 'join', v: 2, deviceKey: key(10) }, 21_100), 'd', 'welcome');
    expect(welcome.arena.blocks).toEqual([]);
  });
});
