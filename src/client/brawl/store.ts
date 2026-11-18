// The screen's brawl state (R3): the server clock estimate and each fighter's launch, replayed with the core flight.
// RoomStore applies the messages; screens ask flightPosition() every frame. The screen never judges (FR-031).
import { buildGrid, makeArena } from '../../core/brawl/arena.ts';
import { positionAt, simulate, type Flight, type Launch } from '../../core/brawl/flight.ts';
import { TUNING } from '../../core/brawl/tuning.ts';
import type { ServerMessage } from '../../core/protocol.ts';
import type { Vec3 } from '../../core/themes.ts';
import { LOOKS } from './looks.ts';

// from/fromAt: where the fighter was drawn when the launch arrived, so a late one is caught up, not jumped to.
export type FighterView = { damage: number; launch: Launch | null; from: Vec3 | null; fromAt: number; knockedOut: boolean };
export type BrawlState = {
  // min(received − at): the server clock read late, never early (R2).
  offset: number | null;
  fighters: Record<string, FighterView>;
  blocks: Extract<ServerMessage, { t: 'welcome' }>['arena']['blocks'];
  // When my next skill is accepted, in server time (swing.readyAt).
  readyAt: number;
};

export const initialBrawl: BrawlState = { offset: null, fighters: {}, blocks: [], readyAt: 0 };
const ARENA = makeArena(TUNING);
const flights = new WeakMap<Launch, Flight>();

export const serverNow = (s: BrawlState, local: number) => local - (s.offset ?? 0);

function flightOf(launch: Launch): Flight {
  let f = flights.get(launch);
  // shortcut: replays on the default arena; US3 (T043) passes the channel's blocks.
  if (!f) flights.set(launch, (f = simulate(launch, buildGrid(ARENA, new Map()), ARENA, TUNING)));
  return f;
}

// Where a flying fighter is drawn at local time `local`, or null when not flying.
export function flightPosition(s: BrawlState, peerId: string, local: number): Vec3 | null {
  const f = s.fighters[peerId];
  if (!f?.launch) return null;
  const on = positionAt(flightOf(f.launch), f.launch, serverNow(s, local), TUNING);
  const k = f.from ? Math.min(1, (local - f.fromAt) / LOOKS.flight.catchUpMs) : 1;
  return k >= 1 || !f.from ? on : (on.map((v, i) => f.from![i] + (v - f.from![i]) * k) as Vec3);
}

const blank: FighterView = { damage: 0, launch: null, from: null, fromAt: 0, knockedOut: false };

// pose: where each peer is drawn now (the store's pose, or its flight), for the catch-up start.
export function applyBrawl(s: BrawlState, msg: ServerMessage, received: number, pose: (peerId: string) => Vec3 | undefined, me: string | undefined): BrawlState {
  if (!('at' in msg)) return s;
  const offset = Math.min(s.offset ?? Infinity, received - msg.at);
  const next = { ...s, offset };
  const set = (peerId: string, patch: Partial<FighterView>) => ({ ...next.fighters, [peerId]: { ...(next.fighters[peerId] ?? blank), ...patch } });
  const launched = (peerId: string, launch: Launch) => {
    const late = serverNow(next, received) > launch.t;
    return { launch, from: late ? (flightPosition(s, peerId, received) ?? pose(peerId) ?? null) : null, fromAt: received };
  };
  switch (msg.t) {
    case 'welcome':
      return {
        ...initialBrawl,
        offset,
        blocks: msg.arena.blocks,
        fighters: Object.fromEntries(msg.arena.fighters.map((f) => [f.peerId, { ...blank, damage: f.damage, launch: f.launch }])),
      };
    case 'swing': {
      let fighters = next.fighters;
      for (const h of msg.hits) fighters = { ...fighters, [h.peerId]: { ...(fighters[h.peerId] ?? blank), damage: h.damage, ...launched(h.peerId, h.launch) } };
      return { ...next, fighters, readyAt: msg.peerId === me ? msg.readyAt : s.readyAt };
    }
    case 'launch':
      return { ...next, fighters: set(msg.peerId, launched(msg.peerId, msg.launch)) };
    case 'landed':
      return { ...next, fighters: set(msg.peerId, { launch: null, from: null }) };
    case 'knocked_out':
      return { ...next, fighters: set(msg.peerId, { launch: null, from: null, knockedOut: true }) };
    case 'respawned':
      return { ...next, fighters: set(msg.peerId, blank) };
    default:
      return next;
  }
}
