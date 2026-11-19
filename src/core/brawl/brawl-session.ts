// One channel's brawl (plan.md, R2): messages in, an Outbox out, and the time of the next event for the room DO's one alarm.
// Fighter state lives on each Participant (the socket attachment, R6); this class holds the channel's blocks and flights.
import type { ClientMessage, ServerMessage } from '../protocol.ts';
import type { Outbox, Participant } from '../room-session.ts';
import type { Vec3 } from '../themes.ts';
import { buildGrid, canPlace, cellKey, hitBlock, inArena, placeBlock, removeBlock, startPoint, targetCell, type Arena, type Block, type Cell, type Changes, type Grid } from './arena.ts';
import { canAct, commitSkill, facesFront, holdSmash, inReach, isGuarding, newFighter, setGuard, takeHit, tryRoll, trySkill, type Fighter } from './fighter.ts';
import { crosses, hitWall, positionAt, simulate, type Flight, type Launch } from './flight.ts';
import { facingDir, launchVector, resolveHit, roundTo } from './knockback.ts';
import type { Tuning } from './tuning.ts';

export type BrawlMessage = Exclude<ClientMessage, { t: 'join' | 'move' | 'chat' }>;
type ArenaView = Extract<ServerMessage, { t: 'welcome' }>['arena'];
type Hit = Extract<ServerMessage, { t: 'swing' }>['hits'][number];
type Armed = Participant & { fighter: Fighter };
type BlockMsg = Extract<BrawlMessage, { t: 'block' }>;

const armed = (p: Participant): p is Armed => !!p.fighter;
const none: Outbox = { send: [] };
const everyone = (members: Participant[], msg: ServerMessage): Outbox => ({ send: members.map((p) => ({ to: p.peerId, msg })) });

export class BrawlSession {
  readonly changed: Changes = new Map();
  // Set when the blocks change; the room DO stores them (arena:<channel>, R6) and clears it.
  dirty = false;
  private readonly arena: Arena;
  private readonly tuning: Tuning;
  private grid: Grid;
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
    else if (msg.t === 'block') return this.block(me, msg, members, now);
    return none;
  }

  // The stored diff after a wake (R6).
  restore(blocks: ArenaView['blocks']): void {
    for (const [cell, kind, hp] of blocks) this.changed.set(cellKey(cell), kind ? { cell, kind, hp } : null);
    this.grid = buildGrid(this.arena, this.changed);
  }

  // FR-040, R10: back to the default arena; everyone in the arena stands at a start at 0%.
  reset(members: Participant[], now: number): Outbox {
    this.changed.clear();
    this.grid = buildGrid(this.arena, this.changed);
    this.dirty = true;
    const fighters = members.filter(armed);
    const send = everyone(members, { t: 'arena_reset', at: now }).send;
    fighters.forEach((p, i) => {
      p.fighter = newFighter(now, this.tuning);
      const at = startPoint(this.arena, i);
      [p.pose, p.lastMoveAt] = [{ p: at, r: 0, a: 'idle' }, now];
      send.push(...everyone(members, { t: 'respawned', peerId: p.peerId, p: at, at: now }).send);
    });
    return { send };
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
      fighters: members.filter(armed).map((p) => ({ peerId: p.peerId, damage: Math.round(p.fighter.damage), launch: p.fighter.flight, stocks: null })),
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
    if (end.kind === 'ko') return this.knockOut(me, at, members);
    if (end.kind === 'wall') {
      const cell = end.cell!;
      const kind = this.grid.get(cellKey(cell))?.kind ?? 'dirt';
      const launch = f.flight!;
      const r = hitWall(launch, end, kind, f.guardPressedAt, f.damage, this.tuning);
      if (r.result === 'tech') {
        [f.flight, f.stunUntil] = [null, at];
        return this.stand(me, end.p, 'tech', at, members);
      }
      f.damage = r.damage;
      f.flight = r.launch;
      const wall = { result: r.result, damage: Math.round(r.damage), cell };
      const send = everyone(members, { t: 'launch', peerId: me.peerId, at, launch: r.launch!, wall }).send;
      // Broken through: the block is gone (no block message, websocket.md), and other flights through it change.
      if (r.result === 'break') send.push(...this.changedAt(cell, () => removeBlock(this.arena, this.changed, this.grid, cell), members, at, me).send);
      return { send };
    }
    f.flight = null;
    return this.stand(me, end.p, 'land', at, members);
  }

  private stand(me: Armed, p: Vec3, end: 'land' | 'tech', at: number, members: Participant[]): Outbox {
    [me.pose, me.lastMoveAt] = [{ ...me.pose, p, a: 'idle' }, at];
    return everyone(members, { t: 'landed', peerId: me.peerId, p, end, at });
  }

  // FR-015~017, FR-034: in the arena, the cell in front at one of three heights; place only on an empty cell.
  private block(me: Armed, msg: BlockMsg, members: Participant[], now: number): Outbox {
    const from = this.position(me, now);
    if (!inArena(this.arena, from)) return none;
    const cell = targetCell(this.arena, from, me.pose.r, msg.h);
    if (msg.op === 'place') {
      const bodies = members.filter(armed).filter((o) => o.fighter.knockedOutAt === null).map((o) => this.position(o, now));
      if (!canPlace(this.arena, this.grid, cell, bodies)) return none;
      let placed: Block | undefined;
      const relaunched = this.changedAt(cell, () => (placed = placeBlock(this.arena, this.changed, this.grid, cell, msg.kind, this.tuning)), members, now);
      return { send: [...everyone(members, { t: 'block', cell, kind: placed!.kind, hp: placed!.hp, at: now }).send, ...relaunched.send] };
    }
    if (!this.grid.has(cellKey(cell))) return none;
    let hit: ReturnType<typeof hitBlock> = null;
    const change = () => (hit = hitBlock(this.arena, this.changed, this.grid, cell));
    // Only a block that goes away changes a path; a lost hp point does not.
    const relaunched = this.grid.get(cellKey(cell))!.hp > 1 ? (change(), none) : this.changedAt(cell, change, members, now);
    this.dirty = true;
    return { send: [...everyone(members, { t: 'block', ...hit!, at: now }).send, ...relaunched.send] };
  }

  // Applies a change at cell, then relaunches every flight (but skip's) whose rest goes through it, from where it is now.
  private changedAt(cell: Cell, change: () => void, members: Participant[], now: number, skip?: Participant): Outbox {
    const t = this.tuning;
    const hit = members.filter(armed).filter((o) => {
      const l = o !== skip && o.fighter.flight;
      return l && crosses(this.arena, this.flight(l), Math.round((now - l.t) / t.stepMs), cell);
    });
    change();
    this.dirty = true;
    const send: Outbox['send'] = [];
    for (const o of hit) {
      const l = o.fighter.flight!;
      const { points, vels } = this.flight(l);
      const i = Math.min(vels.length - 1, Math.max(0, Math.round((now - l.t) / t.stepMs)));
      const launch: Launch =
        now <= l.t
          ? { ...l, cause: 'block' }
          : { t: now, p: points[i].map((v) => roundTo(v, t.precision.p)) as Vec3, v: vels[i].map((v) => roundTo(v, t.precision.v) + 0) as Vec3, s: l.s, cause: 'block' };
      o.fighter.flight = launch;
      send.push(...everyone(members, { t: 'launch', peerId: o.peerId, at: now, launch }).send);
    }
    return { send };
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
    // The peace zone (FR-013) is everywhere outside the arena box, whatever state a fighter carries.
    if (!inArena(this.arena, from)) return none;
    const facing = facingDir(me.pose.r);
    const targets = members
      .filter(armed)
      .filter((o) => o !== me && o.fighter.knockedOutAt === null && now >= o.fighter.invulnUntil)
      .map((o) => ({ o, at: this.position(o, now) }))
      .filter(({ at }) => inArena(this.arena, at))
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
      return { peerId: o.peerId, damage: Math.round(r.damage), guarded, hitstopMs: r.hitstopMs, launch };
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
