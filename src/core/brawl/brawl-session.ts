// One channel's brawl (plan.md, R2): messages in, an Outbox out, and the time of the next event for the room DO's one alarm.
// Fighter state lives on each Participant (the socket attachment, R6); this class holds the channel's blocks and flights.
import type { ClientMessage, ServerMessage } from '../protocol.ts';
import type { Outbox, Participant } from '../room-session.ts';
import type { Vec3 } from '../themes.ts';
import { buildGrid, startPoint, type Arena, type Cell, type Changes, type Grid } from './arena.ts';
import { canAct, commitSkill, facesFront, holdSmash, inReach, isGuarding, newFighter, setGuard, takeHit, tryRoll, trySkill, type Fighter } from './fighter.ts';
import { positionAt, simulate, type Flight, type Launch } from './flight.ts';
import { facingDir, launchVector, resolveHit, roundTo } from './knockback.ts';
import type { Tuning } from './tuning.ts';

export type BrawlMessage = Exclude<ClientMessage, { t: 'join' | 'move' | 'chat' }>;
type ArenaView = Extract<ServerMessage, { t: 'welcome' }>['arena'];
type Hit = Extract<ServerMessage, { t: 'swing' }>['hits'][number];
type Armed = Participant & { fighter: Fighter };

const armed = (p: Participant): p is Armed => !!p.fighter;
const none: Outbox = { send: [] };
const everyone = (members: Participant[], msg: ServerMessage): Outbox => ({ send: members.map((p) => ({ to: p.peerId, msg })) });

export class BrawlSession {
  readonly changed: Changes = new Map();
  private readonly arena: Arena;
  private readonly tuning: Tuning;
  private readonly grid: Grid;
  private readonly flights = new WeakMap<Launch, Flight>();

  constructor(arena: Arena, tuning: Tuning) {
    this.arena = arena;
    this.tuning = tuning;
    this.grid = buildGrid(arena, this.changed);
  }

  enter(me: Participant, now: number): void {
    me.fighter = newFighter(now, this.tuning);
  }

  // The server owns the position while flying, in hitstun or knocked out (R4); the client's move.p is ignored then.
  locked(me: Participant, now: number): boolean {
    const f = me.fighter;
    return !!f && (f.flight !== null || !canAct(f, now));
  }

  // Walking off the edge: the height the client sends decides (R4). shortcut: a doctored client need not fall; if that
  // matters, check the blocks under the feet on the server.
  fell(me: Participant, y: number, members: Participant[], now: number): Outbox | null {
    if (!armed(me) || y >= this.arena.koY) return null;
    return this.knockOut(me, now, members);
  }

  handle(me: Participant, msg: BrawlMessage, members: Participant[], now: number): Outbox {
    if (!armed(me) || me.fighter.knockedOutAt !== null) return none;
    const f = me.fighter;
    if (msg.t === 'hold') holdSmash(f, now);
    else if (msg.t === 'guard') setGuard(f, msg.on, now);
    else if (msg.t === 'roll') tryRoll(f, now, this.tuning);
    else if (msg.t === 'skill') return this.swing(me, msg.k, msg.nonce, members, now);
    return none;
  }

  nextEventAt(members: Participant[]): number | null {
    const times = members.filter(armed).flatMap((p) => this.eventAt(p.fighter) ?? []);
    return times.length ? Math.min(...times) : null;
  }

  // Every event due by now, in time order (R2).
  runEvents(members: Participant[], now: number): Outbox {
    const send: Outbox['send'] = [];
    for (;;) {
      const due = members.filter(armed).filter((p) => (this.eventAt(p.fighter) ?? Infinity) <= now);
      if (!due.length) return { send };
      const me = due.reduce((a, b) => (this.eventAt(b.fighter)! < this.eventAt(a.fighter)! ? b : a));
      send.push(...this.runEvent(me, members).send);
    }
  }

  view(members: Participant[]): ArenaView {
    return {
      blocks: [...this.changed].map(([key, b]) => (b ? [b.cell, b.kind, b.hp] : [key.split(',').map(Number) as Cell, null, 0])),
      fighters: members.filter(armed).map((p) => ({ peerId: p.peerId, damage: p.fighter.damage, launch: p.fighter.flight, stocks: null })),
      match: null,
    };
  }

  private flight(launch: Launch): Flight {
    let f = this.flights.get(launch);
    if (!f) this.flights.set(launch, (f = simulate(launch, this.grid, this.arena, this.tuning)));
    return f;
  }

  private position(p: Participant, now: number): Vec3 {
    const launch = p.fighter?.flight;
    return launch ? positionAt(this.flight(launch), launch, now, this.tuning) : p.pose.p;
  }

  private eventAt(f: Fighter): number | null {
    if (f.flight) return this.flight(f.flight).end.t;
    return f.knockedOutAt === null ? null : f.knockedOutAt + this.tuning.respawnMs;
  }

  private runEvent(me: Armed, members: Participant[]): Outbox {
    const f = me.fighter;
    if (!f.flight) return this.respawn(me, members);
    const end = this.flight(f.flight).end;
    const at = Math.round(end.t);
    f.flight = null;
    if (end.kind === 'ko') return this.knockOut(me, at, members);
    // A wall stops the flight until US3 adds bounce, break and tech.
    [me.pose, me.lastMoveAt] = [{ ...me.pose, p: end.p, a: 'idle' }, at];
    return everyone(members, { t: 'landed', peerId: me.peerId, p: end.p, end: 'land', at });
  }

  private knockOut(me: Armed, at: number, members: Participant[]): Outbox {
    [me.fighter.flight, me.fighter.knockedOutAt] = [null, at];
    return everyone(members, { t: 'knocked_out', peerId: me.peerId, respawnAt: at + this.tuning.respawnMs, stocks: null, out: false, at });
  }

  private respawn(me: Armed, members: Participant[]): Outbox {
    const at = me.fighter.knockedOutAt! + this.tuning.respawnMs;
    const standing = members.filter((o) => o !== me && armed(o) && o.fighter.knockedOutAt === null).length;
    const p = startPoint(this.arena, standing);
    me.fighter = newFighter(at, this.tuning);
    [me.pose, me.lastMoveAt] = [{ p, r: 0, a: 'idle' }, at];
    return everyone(members, { t: 'respawned', peerId: me.peerId, p, at });
  }

  private swing(me: Armed, k: 'jab' | 'smash' | 'throw', nonce: string | undefined, members: Participant[], now: number): Outbox {
    const t = this.tuning;
    const used = trySkill(me.fighter, k, now, t);
    if (!used) return none;
    const from = this.position(me, now);
    const facing = facingDir(me.pose.r);
    const targets = members
      .filter(armed)
      .filter((o) => o !== me && o.fighter.knockedOutAt === null && now >= o.fighter.invulnUntil)
      .map((o) => ({ o, at: this.position(o, now) }))
      .filter(({ at }) => inReach(from, me.pose.r, at, t.skills[used.id].reach, t))
      .sort((a, b) => dist(from, a.at) - dist(from, b.at))
      .slice(0, k === 'throw' ? 1 : undefined);
    const dir = k === 'throw' ? (unit(me.fighter.inputDir) ?? facing) : facing;
    const hits: Hit[] = targets.map(({ o, at }) => {
      const guarded = k !== 'throw' && isGuarding(o.fighter, now) && facesFront(at, o.pose.r, from, t);
      const r = resolveHit({ before: o.fighter.damage, skill: used.id, chargeMs: used.chargeMs, guarded }, t);
      const s = roundTo(r.strength, t.precision.v);
      const launch: Launch = {
        t: now + r.hitstopMs,
        p: at.map((v) => roundTo(v, t.precision.p)) as Vec3,
        v: launchVector(t.skills[used.id].angleDeg, dir, s, t),
        s,
        cause: 'hit',
      };
      takeHit(o.fighter, r, launch, now);
      return { peerId: o.peerId, damage: r.damage, guarded, hitstopMs: r.hitstopMs, launch };
    });
    const hitstopMs = Math.max(0, ...hits.map((h) => h.hitstopMs));
    const readyAt = commitSkill(me.fighter, used, now, hitstopMs, t);
    const swing: ServerMessage = { t: 'swing', peerId: me.peerId, k, ...(used.step && { step: used.step }), at: now, hitstopMs, readyAt, hits };
    return { send: members.map((p) => ({ to: p.peerId, msg: p === me && nonce !== undefined ? { ...swing, nonce } : swing })) };
  }
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function unit(d: [number, number] | null): [number, number] | null {
  const n = d && Math.hypot(d[0], d[1]);
  return d && n ? [d[0] / n, d[1] / n] : null;
}
