// The screen's brawl state (R3): the server clock estimate and each fighter's launch, replayed with the core flight.
// RoomStore applies the messages; screens ask flightPosition() every frame. The screen never judges (FR-031).
import { buildGrid, makeArena } from '../../core/brawl/arena.ts';
import { positionAt, simulate, type Flight, type Launch } from '../../core/brawl/flight.ts';
import { damageColor } from '../../core/brawl/feel.ts';
import { TUNING } from '../../core/brawl/tuning.ts';
import type { ServerMessage } from '../../core/protocol.ts';
import type { Vec3 } from '../../core/themes.ts';
import { LOOKS } from './looks.ts';

// from/fromAt: where the fighter was drawn when the launch arrived, so a late one is caught up, not jumped to.
// stopUntil: the hitstop's end in server time (FR-020): the attacker's at + hitstopMs, a target's launch.t.
export type FighterView = { damage: number; launch: Launch | null; from: Vec3 | null; fromAt: number; knockedOut: boolean; stopUntil: number };
export type BrawlState = {
  // min(received − at): the server clock read late, never early (R2).
  offset: number | null;
  fighters: Record<string, FighterView>;
  blocks: Extract<ServerMessage, { t: 'welcome' }>['arena']['blocks'];
  // When my next jab is accepted, in server time (swing.readyAt of my jabs; cooldowns are per skill, only a jab is held).
  readyAt: number;
  // The last few hits and knock-outs, for the 2D live log (FR-033).
  log: LogEntry[];
  // Local time the last hit strong enough to shake arrived (FR-023).
  shakeAt: number;
};
export type LogEntry = { id: number; kind: 'hit' | 'ko' | 'respawn'; peerId: string; by?: string; damage?: number };

export const initialBrawl: BrawlState = { offset: null, fighters: {}, blocks: [], readyAt: 0, log: [], shakeAt: -Infinity };
const LOG_SIZE = 5;
const logged = (s: BrawlState, ...entries: Omit<LogEntry, 'id'>[]): LogEntry[] => {
  let id = s.log.at(-1)?.id ?? 0;
  return [...s.log, ...entries.map((e) => ({ ...e, id: ++id }))].slice(-LOG_SIZE);
};
const ARENA = makeArena(TUNING);
const flights = new WeakMap<Launch, Flight>();

export const serverNow = (s: BrawlState, local: number) => local - (s.offset ?? 0);

export function flightOf(launch: Launch): Flight {
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

const blank: FighterView = { damage: 0, launch: null, from: null, fromAt: 0, knockedOut: false, stopUntil: 0 };

// The looks every screen derives alike from server values (FR-024); the E2E hook compares them across screens.
export function feel(s: BrawlState, peerId: string) {
  const f = s.fighters[peerId] ?? blank;
  return { stopUntil: f.stopUntil, trail: !!f.launch, color: damageColor(f.damage, TUNING) };
}

export const stopped = (s: BrawlState, peerId: string, local: number) => serverNow(s, local) < (s.fighters[peerId]?.stopUntil ?? 0);

// How far the camera shakes now: the amplitude fading to 0 over durationMs, 0 when the device turned shaking off.
export function shakeOffset(s: BrawlState, local: number, on: boolean): number {
  const k = 1 - (local - s.shakeAt) / LOOKS.shake.durationMs;
  return on && k > 0 && k <= 1 ? LOOKS.shake.amplitude * k : 0;
}

// pose: where each peer is drawn now (the store's pose, or its flight), for the catch-up start.
export function applyBrawl(s: BrawlState, msg: ServerMessage, received: number, pose: (peerId: string) => Vec3 | undefined, me: string | undefined): BrawlState {
  // Someone who leaves mid-flight gets no landed or knocked_out, so their trail and flight go with them (PR #90 review).
  if (msg.t === 'peer_left') return msg.peerId in s.fighters ? { ...s, fighters: Object.fromEntries(Object.entries(s.fighters).filter(([id]) => id !== msg.peerId)) } : s;
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
        // A fresh estimate per connection, so a reconnect fixes a local clock that stepped forward.
        offset: received - msg.at,
        blocks: msg.arena.blocks,
        fighters: Object.fromEntries(msg.arena.fighters.map((f) => [f.peerId, { ...blank, damage: f.damage, launch: f.launch }])),
      };
    case 'swing': {
      let fighters = msg.hits.length ? set(msg.peerId, { stopUntil: msg.at + msg.hitstopMs }) : next.fighters;
      for (const h of msg.hits)
        fighters = { ...fighters, [h.peerId]: { ...(fighters[h.peerId] ?? blank), damage: h.damage, stopUntil: h.launch.t, ...launched(h.peerId, h.launch) } };
      const log = logged(next, ...msg.hits.map((h) => ({ kind: 'hit' as const, peerId: h.peerId, by: msg.peerId, damage: h.damage })));
      const shakeAt = msg.hits.some((h) => h.launch.s >= LOOKS.shake.strengthFrom) ? received : s.shakeAt;
      return { ...next, fighters, log, shakeAt, readyAt: msg.peerId === me && msg.k === 'jab' ? msg.readyAt : s.readyAt };
    }
    case 'launch':
      return { ...next, fighters: set(msg.peerId, launched(msg.peerId, msg.launch)) };
    case 'landed':
      return { ...next, fighters: set(msg.peerId, { launch: null, from: null }) };
    case 'knocked_out':
      return { ...next, fighters: set(msg.peerId, { launch: null, from: null, knockedOut: true }), log: logged(next, { kind: 'ko', peerId: msg.peerId }) };
    case 'respawned':
      return { ...next, fighters: set(msg.peerId, blank), log: logged(next, { kind: 'respawn', peerId: msg.peerId }) };
    default:
      return next;
  }
}
