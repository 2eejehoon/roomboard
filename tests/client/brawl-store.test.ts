// T011: the screen's brawl state (R3): server clock estimate, replaying launches with the core flight, late catch-up.
import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../src/client/brawl/looks.ts';
import { feel, flightPosition, serverNow, shakeOffset, stopped } from '../../src/client/brawl/store.ts';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { buildGrid, makeArena } from '../../src/core/brawl/arena.ts';
import { positionAt, simulate, type Launch } from '../../src/core/brawl/flight.ts';
import { TUNING } from '../../src/core/brawl/tuning.ts';
import type { ServerMessage } from '../../src/core/protocol.ts';
import { createRoomData } from '../../src/core/room-data.ts';

const arena = makeArena(TUNING);
const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const peer = (peerId: string, p: [number, number, number]) => ({ peerId, nickname: `닉 ${peerId}`, avatarId: 'char-01', p, r: 0, a: 'idle' as const });
const welcome = (at: number): ServerMessage => ({
  t: 'welcome',
  v: 2,
  you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
  channel: 1,
  room,
  peers: [peer('b', [31.5, 1, 4.5])],
  spawn: [0, 0, 4],
  arena: { blocks: [], fighters: [{ peerId: 'b', damage: 7, launch: null, stocks: null }], match: null },
  at,
});
const launch: Launch = { t: 20_035, p: [31.5, 1, 4.5], v: [3, 6, 0], s: 10, cause: 'hit' };
const swing = (at: number, l = launch): ServerMessage => ({
  t: 'swing',
  peerId: 'me',
  k: 'jab',
  step: 1,
  at,
  hitstopMs: 35,
  readyAt: at + 385,
  hits: [{ peerId: 'b', damage: 10, guarded: false, hitstopMs: 35, launch: l }],
});
const store = () => {
  const s = new RoomStore();
  s.apply(welcome(10_000), 10_100);
  return s;
};

describe('brawl store (R3)', () => {
  it('estimates the server clock from the smallest (received − at)', () => {
    const s = store();
    expect(s.getState().brawl.offset).toBe(100);
    s.apply(swing(20_000), 20_050);
    expect(s.getState().brawl.offset).toBe(50);
    s.apply({ t: 'landed', peerId: 'b', p: [33, 1, 4.5], end: 'land', at: 21_000 }, 21_300);
    expect(serverNow(s.getState().brawl, 30_000)).toBe(29_950);
  });

  it('starts the estimate over on welcome, so a reconnect fixes a local clock that jumped forward (PR #86 review)', () => {
    const s = store();
    s.apply(swing(20_000), 20_050);
    expect(s.getState().brawl.offset).toBe(50);
    s.apply(welcome(30_000), 30_200);
    expect(s.getState().brawl.offset).toBe(200);
  });

  it('takes the fighters from welcome and updates damage, launch and my readyAt from swing', () => {
    const s = store();
    expect(s.getState().brawl.fighters.b).toMatchObject({ damage: 7, launch: null });
    s.apply(swing(20_000), 20_050);
    expect(s.getState().brawl.fighters.b).toMatchObject({ damage: 10, launch });
    expect(s.getState().brawl.readyAt).toBe(20_385);
  });

  it('readyAt follows only my jabs: cooldowns are per skill, and only a jab is held (FR-012)', () => {
    const s = store();
    s.apply({ ...swing(20_000), k: 'smash', readyAt: 21_000 } as ServerMessage, 20_050);
    expect(s.getState().brawl.readyAt).toBe(0);
    s.apply(swing(22_000), 22_050);
    expect(s.getState().brawl.readyAt).toBe(22_385);
  });

  it('replays the launch with the core flight at the estimated server time', () => {
    const s = store();
    s.apply(swing(20_000), 20_000 + 50);
    const sim = simulate(launch, buildGrid(arena, new Map()), arena, TUNING);
    const local = 20_050 + 300 + LOOKS.flight.catchUpMs;
    expect(flightPosition(s.getState().brawl, 'b', local)).toEqual(positionAt(sim, launch, local - 50, TUNING));
  });

  it('a launch that arrives late starts from where b was drawn and catches up within catchUpMs', () => {
    const s = store();
    const late: Launch = { ...launch, t: 19_000 };
    s.apply(swing(18_965, late), 20_000 + 50);
    // offset stays 100 from welcome; at receipt the server time is 19 950, well into the flight.
    expect(flightPosition(s.getState().brawl, 'b', 20_050)).toEqual([31.5, 1, 4.5]);
    const sim = simulate(late, buildGrid(arena, new Map()), arena, TUNING);
    const after = 20_050 + LOOKS.flight.catchUpMs;
    expect(flightPosition(s.getState().brawl, 'b', after)).toEqual(positionAt(sim, late, after - 100, TUNING));
  });

  it('landed ends the flight and moves the peer; knocked_out and respawned reset the damage', () => {
    const s = store();
    s.apply(swing(20_000), 20_050);
    s.apply({ t: 'landed', peerId: 'b', p: [33, 1, 4.5], end: 'land', at: 21_000 }, 21_050);
    expect(s.getState().brawl.fighters.b.launch).toBeNull();
    expect(flightPosition(s.getState().brawl, 'b', 21_100)).toBeNull();
    expect(s.getState().peers[0].p).toEqual([33, 1, 4.5]);
    s.apply({ t: 'knocked_out', peerId: 'b', respawnAt: 24_000, stocks: null, out: false, at: 21_000 }, 21_050);
    expect(s.getState().brawl.fighters.b).toMatchObject({ knockedOut: true, launch: null });
    s.apply({ t: 'respawned', peerId: 'b', p: [24.5, 1, 4.5], at: 24_000 }, 24_050);
    expect(s.getState().brawl.fighters.b).toMatchObject({ damage: 0, knockedOut: false });
    expect(s.getState().peers[0].p).toEqual([24.5, 1, 4.5]);
  });

  it('my own respawn moves me', () => {
    const s = store();
    s.apply({ t: 'respawned', peerId: 'me', p: [24.5, 1, 4.5], at: 24_000 }, 24_050);
    expect(s.getState().you?.p).toEqual([24.5, 1, 4.5]);
  });
});

describe('brawl store: feel (US2, FR-020~024)', () => {
  it('stops the attacker until at + hitstopMs and the target until launch.t, in server time (FR-020)', () => {
    const s = store();
    s.apply({ ...swing(20_000), peerId: 'a' } as ServerMessage, 20_050);
    const b = s.getState().brawl;
    // offset 50: server 20 034 is local 20 084.
    expect(stopped(b, 'a', 20_084)).toBe(true);
    expect(stopped(b, 'a', 20_085)).toBe(false);
    expect(stopped(b, 'b', 20_084)).toBe(true);
    expect(stopped(b, 'b', 20_085)).toBe(false);
    expect(stopped(b, 'me', 20_060)).toBe(false);
  });

  it('feel() is the same from server values on every screen: stop time, trail while flying, % colour (FR-024)', () => {
    const one = store();
    const two = store();
    one.apply(swing(20_000), 20_050);
    two.apply(swing(20_000), 20_400);
    for (const s of [one, two]) expect(feel(s.getState().brawl, 'b')).toEqual({ stopUntil: 20_035, trail: true, color: 'white' });
    one.apply({ t: 'landed', peerId: 'b', p: [33, 1, 4.5], end: 'land', at: 21_000 }, 21_050);
    expect(feel(one.getState().brawl, 'b').trail).toBe(false);
    one.apply({ ...swing(22_000), hits: [{ peerId: 'b', damage: 55, guarded: false, hitstopMs: 35, launch }] } as ServerMessage, 22_050);
    expect(feel(one.getState().brawl, 'b').color).toBe('yellow');
  });

  it('shakes only for a hit of strength >= LOOKS.shake.strengthFrom, fading over durationMs, never when off (FR-023, US2-5)', () => {
    const s = store();
    s.apply(swing(20_000, { ...launch, s: LOOKS.shake.strengthFrom - 0.1 }), 20_050);
    expect(shakeOffset(s.getState().brawl, 20_060, true)).toBe(0);
    s.apply(swing(21_000, { ...launch, t: 21_035, s: LOOKS.shake.strengthFrom }), 21_050);
    expect(shakeOffset(s.getState().brawl, 21_050, true)).toBe(LOOKS.shake.amplitude);
    expect(shakeOffset(s.getState().brawl, 21_050 + LOOKS.shake.durationMs / 2, true)).toBeCloseTo(LOOKS.shake.amplitude / 2);
    expect(shakeOffset(s.getState().brawl, 21_050 + LOOKS.shake.durationMs, true)).toBe(0);
    // Off: no shake, but the stop and the trail stay.
    expect(shakeOffset(s.getState().brawl, 21_050, false)).toBe(0);
    expect(feel(s.getState().brawl, 'b')).toMatchObject({ stopUntil: 21_035, trail: true });
  });
});
