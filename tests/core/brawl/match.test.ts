// T044 (FR-025~027, FR-005): the "떨어뜨리기" match through RoomSession, with a fake clock; ranks as a pure function.
import { describe, expect, it } from 'vitest';
import { makeArena } from '../../../src/core/brawl/arena.ts';
import { ranks, type Match } from '../../../src/core/brawl/match.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';
import { createChatFilter } from '../../../src/core/chat-filter.ts';
import type { ServerMessage } from '../../../src/core/protocol.ts';
import { createRoomData } from '../../../src/core/room-data.ts';
import { RoomSession, type Outbox } from '../../../src/core/room-session.ts';
import { THEMES, type Vec3 } from '../../../src/core/themes.ts';

const arena = makeArena(TUNING);
const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ex, , ez] = THEMES.cafe.arenaEntrance;
const ENTRANCE: Vec3 = [ex + 0.5, 0, ez + 0.5];
const EXIT: Vec3 = [arena.origin[0] + arena.exit[0] + 0.5, 1, arena.origin[2] + arena.exit[2] + 0.5];
const msgs = <T extends ServerMessage['t']>(out: Outbox, peerId: string, t: T) =>
  out.send.filter((s) => s.to === peerId && s.msg.t === t).map((s) => s.msg as Extract<ServerMessage, { t: T }>);
const send = (s: RoomSession, id: string, m: object, now: number) => s.receive(id, JSON.stringify(m), now);

// ids join channel 1; `fighters` walk into the arena (a start each), the rest stay in the peace zone. The clock is at 10 s.
async function channel(fighters: string[], watchers: string[] = []) {
  const s = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
  for (const [i, id] of [...fighters, ...watchers].entries()) {
    s.connect(id);
    await send(s, id, { t: 'join', v: 2, deviceKey: key(i + 1) }, 0);
  }
  for (const id of fighters) await send(s, id, { t: 'move', p: ENTRANCE, r: 0, a: 'walk' }, 2000);
  return s;
}
// Walking off down to koY from where the fighter stands: a knock-out by the height the client sends (R4).
const drop = (s: RoomSession, id: string, now: number) => {
  const [x, , z] = s.participant(id)!.pose.p;
  return send(s, id, { t: 'move', p: [x, arena.koY - 0.5, z], r: 0, a: 'jump' }, now);
};

describe('match: start (FR-025)', () => {
  it('starts only from the arena with two or more there and no match yet; everyone in the channel hears it, damage back to 0%', async () => {
    const s = await channel(['a'], ['c']);
    expect((await send(s, 'a', { t: 'match_start' }, 10_000)).send, 'one fighter').toEqual([]);
    expect((await send(s, 'c', { t: 'match_start' }, 10_000)).send, 'from the peace zone').toEqual([]);
    s.connect('b');
    await send(s, 'b', { t: 'join', v: 2, deviceKey: key(9) }, 10_000);
    await send(s, 'b', { t: 'move', p: ENTRANCE, r: 0, a: 'walk' }, 12_000);
    s.participant('b')!.fighter!.damage = 40;
    const out = await send(s, 'b', { t: 'match_start' }, 20_000);
    const expected = { t: 'match', state: 'running', endsAt: 20_000 + TUNING.match.limitMs, players: [{ peerId: 'a', stocks: 3 }, { peerId: 'b', stocks: 3 }], at: 20_000 };
    for (const id of ['a', 'b', 'c']) expect(msgs(out, id, 'match')).toEqual([expected]);
    expect(s.participant('b')!.fighter!.damage).toBe(0);
    expect((await send(s, 'a', { t: 'match_start' }, 20_100)).send, 'a match is running').toEqual([]);
    s.connect('d');
    const welcome = msgs(await send(s, 'd', { t: 'join', v: 2, deviceKey: key(8) }, 20_200), 'd', 'welcome')[0];
    expect(welcome.arena.match).toEqual(expected);
    expect(welcome.arena.fighters.map((f) => f.stocks)).toEqual([3, 3]);
  });

  it('nobody walks in while it runs (FR-026); once it ends the entrance works again', async () => {
    const s = await channel(['a', 'b'], ['c']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    const blocked = await send(s, 'c', { t: 'move', p: ENTRANCE, r: 0, a: 'walk' }, 12_000);
    expect(msgs(blocked, 'c', 'correction')).toEqual([]);
    expect(s.participant('c')!.fighter).toBeUndefined();
    await send(s, 'a', { t: 'move', p: EXIT, r: 0, a: 'walk' }, 15_000);
    await send(s, 'c', { t: 'move', p: THEMES.cafe.spawn, r: 0, a: 'walk' }, 18_000);
    await send(s, 'c', { t: 'move', p: ENTRANCE, r: 0, a: 'walk' }, 22_000);
    expect(s.participant('c')!.fighter).toBeDefined();
  });
});

describe('match: stocks, elimination, results (FR-026·027)', () => {
  it('each knock-out costs a stock; the last one eliminates to the room spawn and the one left wins, damage 0%', async () => {
    const s = await channel(['a', 'b'], ['c']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    let now = 10_000;
    for (const left of [2, 1]) {
      const [ko] = msgs(await drop(s, 'b', (now += 1000)), 'c', 'knocked_out');
      expect(ko).toMatchObject({ peerId: 'b', stocks: left, out: false });
      s.runEvents((now += TUNING.respawnMs));
    }
    s.participant('a')!.fighter!.damage = 25;
    const out = await drop(s, 'b', (now += 1000));
    expect(msgs(out, 'c', 'knocked_out')[0]).toMatchObject({ peerId: 'b', stocks: 0, out: true });
    expect(s.participant('b')!.fighter).toBeUndefined();
    expect(s.participant('b')!.pose.p).toEqual(THEMES.cafe.spawn);
    expect(msgs(out, 'c', 'match')).toEqual([{ t: 'match', state: 'ended', ranks: [{ peerId: 'a', rank: 1 }, { peerId: 'b', rank: 2 }], at: now }]);
    expect(s.participant('a')!.fighter!.damage).toBe(0);
    expect(s.nextEventAt(), 'no respawn for b, no time limit').toBeNull();
    expect((await send(s, 'a', { t: 'match_start' }, now + 100)).send, 'a alone cannot start another').toEqual([]);
  });

  it('walking out the exit or disconnecting eliminates (stocks 0 in a running update); the last one standing wins', async () => {
    const s = await channel(['a', 'b', 'd'], ['c']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    const exit = await send(s, 'a', { t: 'move', p: EXIT, r: 0, a: 'walk' }, 15_000);
    expect(msgs(exit, 'c', 'match')).toEqual([
      { t: 'match', state: 'running', endsAt: 10_000 + TUNING.match.limitMs, players: [{ peerId: 'a', stocks: 0 }, { peerId: 'b', stocks: 3 }, { peerId: 'd', stocks: 3 }], at: 15_000 },
    ]);
    const back = await send(s, 'a', { t: 'move', p: ENTRANCE, r: 0, a: 'walk' }, 20_000);
    expect(s.participant('a')!.fighter, 'out for this match').toBeUndefined();
    expect(msgs(back, 'a', 'correction')).toEqual([]);
    const left = s.leave('d', 21_000);
    expect(msgs(left, 'c', 'match').map((m) => m.state)).toEqual(['running', 'ended']);
    expect(msgs(left, 'c', 'match')[1]).toMatchObject({ ranks: [{ peerId: 'b', rank: 1 }, { peerId: 'd', rank: 2 }, { peerId: 'a', rank: 3 }] });
  });

  it('at the time limit: more stocks first, then lower damage, equal is the same rank, the eliminated below (FR-025a)', async () => {
    const s = await channel(['a', 'b', 'd', 'e']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    let now = 10_000;
    for (let i = 0; i < 3; i++) {
      await drop(s, 'e', (now += 1000));
      if (i < 2) s.runEvents((now += TUNING.respawnMs));
    }
    await drop(s, 'd', (now += 1000));
    s.runEvents(now + TUNING.respawnMs);
    [s.participant('a')!.fighter!.damage, s.participant('b')!.fighter!.damage] = [30.4, 29.6];
    const endsAt = 10_000 + TUNING.match.limitMs;
    expect(s.nextEventAt()).toBe(endsAt);
    expect(s.runEvents(endsAt - 1).send).toEqual([]);
    const [ended] = msgs(s.runEvents(endsAt), 'a', 'match');
    expect(ended).toEqual({
      t: 'match',
      state: 'ended',
      ranks: [
        { peerId: 'a', rank: 1 },
        { peerId: 'b', rank: 1 },
        { peerId: 'd', rank: 3 },
        { peerId: 'e', rank: 4 },
      ],
      at: endsAt,
    });
    expect(['a', 'b', 'd'].map((id) => s.participant(id)!.fighter!.damage)).toEqual([0, 0, 0]);
  });

  it('two last fighters knocked out by the same server judgement (same ms) share 1st place', async () => {
    const s = await channel(['a', 'b']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    let now = 10_000;
    for (let i = 0; i < 2; i++) {
      await drop(s, 'a', (now += 1000));
      await drop(s, 'b', now);
      s.runEvents((now += TUNING.respawnMs));
    }
    // Both step off the west edge in the same ms and say nothing more: the hover rule knocks both out at once.
    now += 5000;
    for (const [id, z] of [['a', 4.5], ['b', 19.5]] as const) {
      await send(s, id, { t: 'move', p: [arena.origin[0] + 0.5, 1, z], r: 0, a: 'walk' }, now - 2000);
      await send(s, id, { t: 'move', p: [arena.origin[0] - 0.4, 0.5, z], r: 0, a: 'jump' }, now);
    }
    const out = s.runEvents(now + TUNING.fallMaxMs);
    expect(msgs(out, 'a', 'knocked_out').map((k) => k.out)).toEqual([true, true]);
    expect(msgs(out, 'a', 'match')).toEqual([{ t: 'match', state: 'ended', ranks: [{ peerId: 'a', rank: 1 }, { peerId: 'b', rank: 1 }], at: now + TUNING.fallMaxMs }]);
  });
});

describe('match: cancelled (FR-040, theme change)', () => {
  it('a theme change sends everyone to the peace zone and cancels the match, so the entrance opens again', async () => {
    const s = await channel(['a', 'b'], ['c']);
    await send(s, 'a', { t: 'match_start' }, 10_000);
    const out = s.update({ ...room, roomData: createRoomData('library') }, true, 12_000);
    expect(msgs(out, 'c', 'match')).toEqual([{ t: 'match', state: 'cancelled', at: 12_000 }]);
    expect(s.nextEventAt()).toBeNull();
    const [lx, , lz] = THEMES.library.arenaEntrance;
    await send(s, 'c', { t: 'move', p: [lx + 0.5, 0, lz + 0.5], r: 0, a: 'walk' }, 20_000);
    expect(s.participant('c')!.fighter).toBeDefined();
  });
});

describe('ranks (FR-025a, FR-027)', () => {
  const match = (players: Match['players']): Match => ({ state: 'running', startedAt: 0, endsAt: 1, players });
  it('ranks the standing by stocks then shown damage, then the eliminated by later out first, ties shared', () => {
    const damage: Record<string, number> = { a: 10.4, b: 9.6, c: 50 };
    const m = match([
      { peerId: 'e', stocks: 0, out: 100 },
      { peerId: 'c', stocks: 2 },
      { peerId: 'a', stocks: 1 },
      { peerId: 'b', stocks: 1 },
      { peerId: 'f', stocks: 0, out: 100 },
      { peerId: 'g', stocks: 0, out: 50 },
    ]);
    expect(ranks(m, (id) => damage[id] ?? 0)).toEqual([
      { peerId: 'c', rank: 1 },
      { peerId: 'a', rank: 2 },
      { peerId: 'b', rank: 2 },
      { peerId: 'e', rank: 4 },
      { peerId: 'f', rank: 4 },
      { peerId: 'g', rank: 6 },
    ]);
  });
});

describe('hover outside the arena box (FR-005, PR #87 review)', () => {
  it('one move off the island and then silence: knocked out by the server at fallMaxMs', async () => {
    const s = await channel(['a', 'b']);
    await send(s, 'a', { t: 'move', p: [arena.origin[0] + 0.5, 1, 4.5], r: 0, a: 'walk' }, 8000);
    await send(s, 'a', { t: 'move', p: [arena.origin[0] - 0.4, 0.5, 4.5], r: 0, a: 'jump' }, 10_000);
    expect(s.nextEventAt()).toBe(10_000 + TUNING.fallMaxMs);
    expect(s.runEvents(10_000 + TUNING.fallMaxMs - 1).send).toEqual([]);
    const [ko] = msgs(s.runEvents(10_000 + TUNING.fallMaxMs), 'b', 'knocked_out');
    expect(ko).toMatchObject({ peerId: 'a', stocks: null, out: false, at: 10_000 + TUNING.fallMaxMs });
    expect(s.runEvents(10_000 + TUNING.fallMaxMs + TUNING.respawnMs).send.map((m) => m.msg.t)).toContain('respawned');
    expect(s.nextEventAt(), 'the respawned fighter is inside again').toBeNull();
  });

  it('only accepted moves count: a rejected claim outside does not start it, a rejected claim inside does not clear it (PR #95 review)', async () => {
    const s = await channel(['a', 'b']);
    const x = arena.origin[0];
    await send(s, 'a', { t: 'move', p: [x + 0.5, 1, 4.5], r: 0, a: 'walk' }, 8000);
    const far = await send(s, 'a', { t: 'move', p: [x - 8, 1, 4.5], r: 0, a: 'jump' }, 8100);
    expect(msgs(far, 'a', 'correction'), 'too fast: rejected').toHaveLength(1);
    expect(s.nextEventAt(), 'still inside, where a can be hit and land').toBeNull();
    await send(s, 'a', { t: 'move', p: [x - 0.4, 0.5, 4.5], r: 0, a: 'jump' }, 10_000);
    await send(s, 'a', { t: 'move', p: [x + 8, 1, 4.5], r: 0, a: 'walk' }, 10_100);
    expect(s.nextEventAt(), 'still outside').toBe(10_000 + TUNING.fallMaxMs);
  });

  it('coming back into the box clears it', async () => {
    const s = await channel(['a', 'b']);
    await send(s, 'a', { t: 'move', p: [arena.origin[0] + 0.5, 1, 4.5], r: 0, a: 'walk' }, 8000);
    await send(s, 'a', { t: 'move', p: [arena.origin[0] - 0.4, 1.2, 4.5], r: 0, a: 'jump' }, 10_000);
    await send(s, 'a', { t: 'move', p: [arena.origin[0] + 0.3, 1, 4.5], r: 0, a: 'walk' }, 10_300);
    expect(s.nextEventAt()).toBeNull();
  });
});
