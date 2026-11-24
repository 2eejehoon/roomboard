// T050 (FR-028·029, US5-1·2): steering the knockback at the hit, and one air jump and one recovery before landing.
import { describe, expect, it } from 'vitest';
import { steer } from '../../../src/core/brawl/knockback.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';
import { createChatFilter } from '../../../src/core/chat-filter.ts';
import type { ServerMessage } from '../../../src/core/protocol.ts';
import { createRoomData } from '../../../src/core/room-data.ts';
import { RoomSession, type Outbox } from '../../../src/core/room-session.ts';
import { THEMES } from '../../../src/core/themes.ts';
import type { Vec3 } from '../../../src/core/themes.ts';

const deg = (a: Vec3, b: Vec3) => {
  const dot = a.reduce((s, v, i) => s + v * b[i]!, 0);
  return (Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;
};
// Rounding v to 3 decimals moves the angle a hair.
const EPS = 0.05;

describe('steer (FR-028)', () => {
  it('turns the launch at most steerMaxDeg toward the held direction, at the same speed', () => {
    const v: Vec3 = [6, 8, 0];
    for (const d of [[0, 1], [0, -1], [1, 0.3], [-0.2, 1], [0.7, -0.7]] as [number, number][]) {
      const out = steer(v, d, TUNING);
      expect(deg(v, out), `${d}`).toBeLessThanOrEqual(TUNING.steerMaxDeg + EPS);
      expect(Math.hypot(...out)).toBeCloseTo(10, 2);
    }
    expect(deg(v, steer(v, [0, 1], TUNING))).toBeCloseTo(TUNING.steerMaxDeg, 1);
  });

  it('does not turn past the held direction, nor without one, nor straight along or against it', () => {
    const v: Vec3 = [10, 0, 0];
    const near: [number, number] = [Math.cos(Math.PI / 36), Math.sin(Math.PI / 36)]; // 5° off
    expect(deg(v, steer(v, near, TUNING))).toBeCloseTo(5, 1);
    expect(steer(v, null, TUNING)).toEqual(v);
    expect(steer(v, [1, 0], TUNING)).toEqual(v);
    expect(steer(v, [-1, 0], TUNING)).toEqual(v);
  });

  it('a flat (0°) launch turns only sideways (R3)', () => {
    const out = steer([10, 0, 0], [0, 1], TUNING);
    expect(out[1]).toBe(0);
    expect(deg([10, 0, 0], out)).toBeCloseTo(TUNING.steerMaxDeg, 1);
  });
});

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ex, , ez] = THEMES.cafe.arenaEntrance;
const EAST = Math.PI / 2;
const msgs = <T extends ServerMessage['t']>(out: Outbox, peerId: string, t: T) =>
  out.send.filter((s) => s.to === peerId && s.msg.t === t).map((s) => s.msg as Extract<ServerMessage, { t: T }>);
const send = (s: RoomSession, id: string, m: object, now: number) => s.receive(id, JSON.stringify(m), now);

// a at the middle facing east, b one metre east; b holds d (or nothing) when a smashes at 20 s.
async function smashed(d?: [number, number], letGo = false) {
  const s = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
  for (const [i, id] of ['a', 'b'].entries()) {
    s.connect(id);
    await send(s, id, { t: 'join', v: 2, deviceKey: key(i + 1) }, 0);
    await send(s, id, { t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' }, 2000);
  }
  await send(s, 'a', { t: 'move', p: [30.5, 1, 12.5], r: EAST, a: 'idle' }, 10_000);
  await send(s, 'b', { t: 'move', p: [31.5, 1, 12.5], r: -EAST, a: 'idle', ...(d && { d }) }, 10_000);
  if (letGo) await send(s, 'b', { t: 'move', p: [31.5, 1, 12.6], r: -EAST, a: 'idle' }, 11_000);
  const [swing] = msgs(await send(s, 'a', { t: 'skill', k: 'smash' }, 20_000), 'b', 'swing');
  return { s, launch: swing.hits[0]!.launch };
}

describe('BrawlSession: steering and air moves (FR-028·029)', () => {
  it('the direction held at the hit bends the launch by at most 15°, and a d sent in flight changes nothing', async () => {
    const plain = (await smashed()).launch;
    const { s, launch } = await smashed([0, 1]);
    const bend = deg(plain.v, launch.v);
    expect(bend).toBeGreaterThan(1);
    expect(bend).toBeLessThanOrEqual(TUNING.steerMaxDeg + EPS);
    expect((await send(s, 'b', { t: 'move', p: [31.5, 1, 12.5], r: 0, a: 'walk', d: [0, -1] }, 20_200)).send).toEqual([]);
    expect(s.participant('b')?.fighter?.flight).toEqual(launch);
  });

  it('a move without d lets go of the direction: a stale walk direction does not steer (or aim a throw)', async () => {
    expect((await smashed([0, 1], true)).launch.v).toEqual((await smashed()).launch.v);
  });

  it('one air jump and one recovery while flying, each a new launch upward; a second of each is refused; landing gives them back', async () => {
    const { s, launch } = await smashed();
    const jump = msgs(await send(s, 'b', { t: 'air', k: 'jump' }, 20_400), 'a', 'launch');
    expect(jump).toHaveLength(1);
    expect(jump[0]!.launch).toMatchObject({ t: 20_400, s: launch.s, cause: 'air' });
    expect(jump[0]!.launch.v[1]).toBe(TUNING.air.jumpSpeed);
    expect(jump[0]!.launch.v[0]).toBeCloseTo(launch.v[0], 2); // the sideways speed carries on
    expect((await send(s, 'b', { t: 'air', k: 'jump' }, 20_450)).send).toEqual([]);
    const recover = msgs(await send(s, 'b', { t: 'air', k: 'recover' }, 20_500), 'a', 'launch');
    expect(recover[0]!.launch).toMatchObject({ t: 20_500, cause: 'recover' });
    expect(recover[0]!.launch.v[1]).toBe(TUNING.air.recoverSpeed);
    expect((await send(s, 'b', { t: 'air', k: 'recover' }, 20_550)).send).toEqual([]);

    // Run to the end of the flight: a landing (or a knock-out and respawn) fills both again.
    for (let at = s.nextEventAt(); at !== null && s.participant('b')?.fighter?.flight; at = s.nextEventAt()) s.runEvents(at);
    while (s.participant('b')?.fighter?.knockedOutAt != null) s.runEvents(s.nextEventAt()!);
    expect(s.participant('b')?.fighter).toMatchObject({ airJumps: TUNING.air.jumps, airRecovers: TUNING.air.recovers });
  });

  it('refuses air moves in hitstun and when not flying (the walking jump is the screen’s)', async () => {
    const { s } = await smashed();
    expect((await send(s, 'b', { t: 'air', k: 'jump' }, 20_100)).send).toEqual([]); // hitstun ends at 20 300
    const idle = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
    idle.connect('c');
    await send(idle, 'c', { t: 'join', v: 2, deviceKey: key(3) }, 0);
    await send(idle, 'c', { t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' }, 2000);
    expect((await send(idle, 'c', { t: 'air', k: 'jump' }, 3000)).send).toEqual([]);
  });
});
