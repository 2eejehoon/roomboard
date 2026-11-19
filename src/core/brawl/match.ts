// The "떨어뜨리기" match (data-model.md "Match", FR-025~027). out is the elimination time: the same server judgement
// (the same ms) gives the same value, so those players share a rank.
import type { Tuning } from './tuning.ts';

export type Player = { peerId: string; stocks: number; out?: number };
export type Match = { state: 'running'; startedAt: number; endsAt: number; players: Player[] };
export type Rank = { peerId: string; rank: number };

export const startMatch = (ids: string[], now: number, t: Tuning): Match => ({
  state: 'running',
  startedAt: now,
  endsAt: now + t.match.limitMs,
  players: ids.map((peerId) => ({ peerId, stocks: t.match.stocks })),
});

export const playing = (m: Match | null, peerId: string): Player | undefined => m?.players.find((p) => p.peerId === peerId && p.out === undefined);

export const isOver = (m: Match, now: number) => m.players.filter((p) => p.out === undefined).length <= 1 || now >= m.endsAt;

// FR-025a, FR-027: the standing by more stocks then lower shown damage, then the eliminated by later out; equal keys share a rank.
export function ranks(m: Match, damageOf: (peerId: string) => number): Rank[] {
  const keyOf = (p: Player) => (p.out === undefined ? [0, -p.stocks, Math.round(damageOf(p.peerId)), 0] : [1, 0, 0, -p.out]);
  const before = (a: number[], b: number[]) => {
    const i = a.findIndex((v, j) => v !== b[j]);
    return i >= 0 && a[i] < b[i];
  };
  const keyed = m.players.map((p) => ({ peerId: p.peerId, key: keyOf(p) }));
  return keyed
    .map(({ peerId, key }) => ({ peerId, rank: 1 + keyed.filter((o) => before(o.key, key)).length }))
    .sort((a, b) => a.rank - b.rank);
}
