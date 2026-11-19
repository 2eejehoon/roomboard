// T027 (US2): the % colour (FR-022) and the hitstop both fighters stop for (FR-020, US2-1·2), read from the server messages.
import { describe, expect, it } from 'vitest';
import { damageColor } from '../../../src/core/brawl/feel.ts';
import { positionAt, simulate } from '../../../src/core/brawl/flight.ts';
import { buildGrid, makeArena } from '../../../src/core/brawl/arena.ts';
import { TUNING, type Tuning } from '../../../src/core/brawl/tuning.ts';
import { createChatFilter } from '../../../src/core/chat-filter.ts';
import type { ServerMessage } from '../../../src/core/protocol.ts';
import { createRoomData } from '../../../src/core/room-data.ts';
import { RoomSession } from '../../../src/core/room-session.ts';
import { THEMES } from '../../../src/core/themes.ts';

describe('damageColor (FR-022)', () => {
  it('is white below 50, yellow from 50, red from 100', () => {
    expect([0, 49, 49.9, 50, 99, 100, 999].map((d) => damageColor(d, TUNING))).toEqual(['white', 'white', 'white', 'yellow', 'yellow', 'red', 'red']);
  });

  it('follows the tuning table (SC-005)', () => {
    const t: Tuning = { ...TUNING, damageColor: { yellowFrom: 10, redFrom: 20 } };
    expect([9, 10, 20].map((d) => damageColor(d, t))).toEqual(['white', 'yellow', 'red']);
  });
});

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ex, , ez] = THEMES.cafe.arenaEntrance;
const EAST = Math.PI / 2;
const send = (s: RoomSession, id: string, m: object, now: number) => s.receive(id, JSON.stringify(m), now);
const swingOf = (out: Awaited<ReturnType<RoomSession['receive']>>) =>
  out.send.find((s) => s.to === 'b' && s.msg.t === 'swing')?.msg as Extract<ServerMessage, { t: 'swing' }>;

async function duel() {
  const s = new RoomSession(room, { filter: createChatFilter([]), sign: async () => 'sig' });
  for (const [i, id] of ['a', 'b'].entries()) {
    s.connect(id);
    await send(s, id, { t: 'join', v: 2, deviceKey: key(i + 1) }, 0);
    await send(s, id, { t: 'move', p: [ex + 0.5, 0, ez + 0.5], r: 0, a: 'walk' }, 2000);
  }
  await send(s, 'a', { t: 'move', p: [30.5, 1, 4.5], r: EAST, a: 'idle' }, 10_000);
  await send(s, 'b', { t: 'move', p: [31.5, 1, 4.5], r: -EAST, a: 'idle' }, 10_000);
  return s;
}

describe('hitstop (FR-020, US2-1·2)', () => {
  it('a first jab stops the attacker and the target about 0.03 s: 30 + 1.3 × 4 = 35 ms, the target held at its start', async () => {
    const s = await duel();
    const swing = swingOf(await send(s, 'a', { t: 'skill', k: 'jab' }, 20_000));
    expect(swing.hitstopMs).toBe(35);
    const [hit] = swing.hits;
    expect(hit.hitstopMs).toBe(35);
    expect(hit.launch.t).toBe(swing.at + 35);
    const arena = makeArena(TUNING);
    const flight = simulate(hit.launch, buildGrid(arena, new Map()), arena, TUNING);
    for (const now of [swing.at, swing.at + 20, swing.at + 35]) expect(positionAt(flight, hit.launch, now, TUNING)).toEqual(hit.launch.p);
  });

  it('the third jab is a finisher: 0.15 s', async () => {
    const s = await duel();
    let now = 20_000;
    let swing = swingOf(await send(s, 'a', { t: 'skill', k: 'jab' }, now));
    for (const step of [2, 3]) {
      now = swing.readyAt;
      swing = swingOf(await send(s, 'a', { t: 'skill', k: 'jab' }, now));
      expect(swing.step).toBe(step);
    }
    expect(swing.hitstopMs).toBe(TUNING.hitstop.maxMs);
    expect(swing.hits[0].launch.t).toBe(now + 150);
  });
});
