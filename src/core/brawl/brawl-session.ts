// One channel's brawl (plan.md, R2): messages in, an Outbox out, and the time of the next event for the room DO's one alarm.
// Skeleton for 004 Phase 2: skills, flights and matches arrive with US1~US5.
import type { ClientMessage, ServerMessage } from '../protocol.ts';
import type { Outbox } from '../room-session.ts';
import type { Cell, Changes } from './arena.ts';

export type BrawlMessage = Exclude<ClientMessage, { t: 'join' | 'move' | 'chat' }>;
type ArenaView = Extract<ServerMessage, { t: 'welcome' }>['arena'];

export class BrawlSession {
  readonly changed: Changes = new Map();

  // US1 adds handle(peerId, msg, now), the flights and their landing and knock-out times.
  nextEventAt(): number | null {
    return null;
  }

  // Catches up on every event due by now (R2).
  runEvents(): Outbox {
    return { send: [] };
  }

  // fighters: who stands in the arena now, by position (R5).
  view(fighters: string[]): ArenaView {
    return {
      blocks: [...this.changed].map(([key, b]) => (b ? [b.cell, b.kind, b.hp] : [key.split(',').map(Number) as Cell, null, 0])),
      fighters: fighters.map((peerId) => ({ peerId, damage: 0, launch: null, stocks: null })),
      match: null,
    };
  }
}
