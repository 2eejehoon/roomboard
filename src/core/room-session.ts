// Pure room state machine (plan.md): participants in, messages and closes out. The room DO feeds it socket events.
import { assignChannel } from './channels.ts';
import { avatarFor, nicknameFor } from './identity.ts';
import { validateMove } from './movement.ts';
import { CLOSE, parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol.ts';
import { BLOCK_RATE, CHAT_RATE, MOVE_RATE, RateBucket } from './rate-bucket.ts';
import { THEMES, type Vec3 } from './themes.ts';
import { cellOf, inArena, makeArena, sameCell, startPoint } from './brawl/arena.ts';
import { BrawlSession, type BrawlMessage } from './brawl/brawl-session.ts';
import { TUNING } from './brawl/tuning.ts';
import type { Fighter } from './brawl/fighter.ts';

const ARENA = makeArena(TUNING);
// 004 R4: a fighter may walk off the island and fall anywhere until koY (then fell() knocks them out); speed is still checked.
const FALL = { min: [-Infinity, ARENA.koY, -Infinity] as Vec3, max: [Infinity, ARENA.bounds.max[1], Infinity] as Vec3 };

export type RoomInfo = Extract<ServerMessage, { t: 'welcome' }>['room'];
export type Pose = { p: Vec3; r: number; a: 'idle' | 'walk' | 'run' | 'jump' };
// data-model.md "Participant": the socket attachment. Never holds the device key.
// fighter: set while in the 004 arena (data-model "Fighter", kept in the attachment, R6).
export type Participant = { peerId: string; nickname: string; avatarId: string; channel: number; pose: Pose; lastMoveAt: number; fighter?: Fighter };
export type Outbox = { send: { to: string; msg: ServerMessage }[]; close?: { to: string; code: number } };
type Chat = Extract<ServerMessage, { t: 'chat' }>;
// What the signature covers besides the room id (websocket.md `chat.sig`).
export type ChatFields = Pick<Chat, 'messageId' | 'nickname' | 'text' | 'sentAt' | 'channel'>;
// The DO passes the word list filter and an HMAC signer bound to the room and SERVER_SECRET; core holds no crypto (T071).
type SessionDeps = { filter: (text: string) => string; sign: (chat: ChatFields) => Promise<string> };

const BAD_LIMIT = 5;
const BAD_WINDOW_MS = 10_000;
const round = (n: number) => Math.round(n * 100) / 100;

// Rate bucket and bad-message times live only in memory; they reset when the DO hibernates, which is fine for abuse limits.
type Conn = { participant: Participant | null; moves: RateBucket; chats: RateBucket; blocks: RateBucket; bad: number[] };
const newConn = (participant: Participant | null): Conn => ({
  participant,
  moves: new RateBucket(MOVE_RATE),
  chats: new RateBucket(CHAT_RATE),
  blocks: new RateBucket(BLOCK_RATE),
  bad: [],
});

export class RoomSession {
  private readonly conns = new Map<string, Conn>();
  private room: RoomInfo;
  private readonly deps: SessionDeps;
  private chatSeq = 0;
  // One brawl per channel (004 FR-018), made on first use.
  private readonly brawls = new Map<number, BrawlSession>();

  constructor(room: RoomInfo, deps: SessionDeps) {
    this.room = room;
    this.deps = deps;
  }

  connect(peerId: string): void {
    this.conns.set(peerId, newConn(null));
  }

  restore(participant: Participant): void {
    this.conns.set(participant.peerId, newConn(participant));
  }

  participant(peerId: string): Participant | null {
    return this.conns.get(peerId)?.participant ?? null;
  }

  get joinedCount(): number {
    return this.joined().length;
  }

  async receive(peerId: string, raw: string, now: number): Promise<Outbox> {
    const conn = this.conns.get(peerId);
    if (!conn) return { send: [] };
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return parsed.reason === 'too_large' ? { send: [], close: { to: peerId, code: CLOSE.tooLarge } } : this.bad(peerId, conn, now);
    const msg = parsed.msg;
    if (msg.t === 'join') return conn.participant ? this.bad(peerId, conn, now) : this.join(peerId, conn, msg, now);
    const me = conn.participant;
    if (!me) return { send: [{ to: peerId, msg: { t: 'error', code: 'not_joined' } }] };
    // Brawl events that fell due since the last message or alarm come first (004 R2).
    const events = this.brawl(me.channel).runEvents(this.members(me.channel), now);
    let taken: ReturnType<RateBucket['take']> | undefined;
    const out =
      msg.t === 'move'
        ? this.move(me, conn, msg, now)
        : msg.t === 'chat'
          ? await this.chat(me, conn, msg, now)
          : msg.t === 'block' && !(taken = conn.blocks.take(now)).ok
            ? { send: [{ to: peerId, msg: { t: 'rate_limited', scope: 'block', retryAfterMs: taken.retryAfterMs } } as const] }
            : this.brawl(me.channel).handle(me, msg satisfies BrawlMessage, this.members(me.channel), now);
    return { ...out, send: [...events.send, ...out.send] };
  }

  // The soonest brawl event in any channel, for the DO's one alarm (004 R2).
  nextEventAt(): number | null {
    const times = [...this.brawls].flatMap(([channel, b]) => b.nextEventAt(this.members(channel)) ?? []);
    return times.length ? Math.min(...times) : null;
  }

  runEvents(now: number): Outbox {
    return { send: [...this.brawls].flatMap(([channel, b]) => b.runEvents(this.members(channel), now).send) };
  }

  // FR-040: the admin's reset, every channel (R10).
  resetArenas(now: number): Outbox {
    return { send: [...this.brawls].flatMap(([channel, b]) => b.reset(this.members(channel), now).send) };
  }

  get dirty(): boolean {
    return [...this.brawls.values()].some((b) => b.dirty);
  }

  // R6: each channel whose blocks changed since the last call, for arena:<channel>; clears the marks.
  takeDirtyArenas(): { channel: number; blocks: Extract<ServerMessage, { t: 'welcome' }>['arena']['blocks'] }[] {
    return [...this.brawls].flatMap(([channel, b]) => {
      if (!b.dirty) return [];
      b.dirty = false;
      return [{ channel, blocks: b.view([]).blocks }];
    });
  }

  restoreArena(channel: number, blocks: Extract<ServerMessage, { t: 'welcome' }>['arena']['blocks']): void {
    this.brawl(channel).restore(blocks);
  }

  // Channels with someone joined; an empty one's arena is gone (FR-018).
  occupied(): Set<number> {
    return new Set(this.joined().map((p) => p.channel));
  }

  // The owner's edit (T083), to every channel. respawn: the theme changed, so old poses mean nothing in the new bounds. The
  // Worker says so, because a session rebuilt after hibernation already holds the new room.
  update(room: RoomInfo, respawn: boolean, now: number): Outbox {
    this.room = room;
    const joined = this.joined();
    if (respawn) for (const p of joined) [p.pose, p.lastMoveAt, p.fighter] = [{ p: THEMES[room.roomData.themeId].spawn, r: 0, a: 'idle' }, now, undefined];
    return { send: joined.map((p) => ({ to: p.peerId, msg: { t: 'room_updated', room } })) };
  }

  leave(peerId: string): Outbox {
    const me = this.participant(peerId);
    this.conns.delete(peerId);
    // FR-018: the last one out takes the channel's arena back to the default.
    if (me && !this.occupied().has(me.channel)) this.brawls.delete(me.channel);
    return me ? this.toChannel(me, { t: 'peer_left', peerId }) : { send: [] };
  }

  private join(peerId: string, conn: Conn, msg: Extract<ClientMessage, { t: 'join' }>, now: number): Outbox {
    if (msg.v !== PROTOCOL_VERSION) {
      return { send: [{ to: peerId, msg: { t: 'error', code: 'unsupported_version' } }], close: { to: peerId, code: CLOSE.unsupportedVersion } };
    }
    const counts: Record<number, number> = {};
    for (const p of this.joined()) counts[p.channel] = (counts[p.channel] ?? 0) + 1;
    const { spawn } = THEMES[this.room.roomData.themeId];
    const me: Participant = {
      peerId,
      nickname: nicknameFor(msg.deviceKey),
      avatarId: avatarFor(msg.deviceKey),
      channel: assignChannel(counts),
      pose: { p: spawn, r: 0, a: 'idle' },
      lastMoveAt: now,
    };
    const peers = this.joined().filter((p) => p.channel === me.channel);
    conn.participant = me;
    const welcome: ServerMessage = {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      you: { peerId, nickname: me.nickname, avatarId: me.avatarId },
      channel: me.channel,
      room: this.room,
      peers: peers.map(peerView),
      spawn,
      arena: this.brawl(me.channel).view(peers),
      at: now,
    };
    return { send: [{ to: peerId, msg: welcome }, ...this.toChannel(me, { t: 'peer_joined', peer: peerView(me) }).send] };
  }

  private move(me: Participant, conn: Conn, msg: Extract<ClientMessage, { t: 'move' }>, now: number): Outbox {
    if (!conn.moves.take(now).ok) return { send: [] };
    const brawl = this.brawl(me.channel);
    if (me.fighter && msg.d) me.fighter.inputDir = msg.d;
    // Flying, in hitstun or knocked out: the server owns the position and only d counts (004 R4).
    if (brawl.locked(me, now)) return { send: [] };
    const fell = brawl.fell(me, msg.p[1], this.members(me.channel), now);
    if (fell) return fell;
    const p = msg.p.map(round) as Vec3;
    const theme = THEMES[this.room.roomData.themeId];
    // A fighter falls freely, but never into the room: that way is only the exit (R5).
    const intoRoom = !!me.fighter && validateMove({ p, at: now }, p, now, [theme.bounds]);
    // A fighter's fall is not walking: the speed check counts only the sideways and upward part (free fall passes 8 m/s, R4).
    const from: Vec3 = me.fighter && p[1] < me.pose.p[1] ? [me.pose.p[0], p[1], me.pose.p[2]] : me.pose.p;
    if (intoRoom || !validateMove({ p: from, at: me.lastMoveAt }, p, now, me.fighter ? [FALL] : [theme.bounds, ARENA.bounds])) {
      return { send: [{ to: me.peerId, msg: { t: 'correction', p: me.pose.p, r: me.pose.r } }] };
    }
    me.pose = { p, r: round(msg.r), a: msg.a };
    me.lastMoveAt = now;
    // The entrance and exit cells teleport (004 R5): a correction to me, peer_moved to the others.
    const fighters = this.members(me.channel).filter((o) => o !== me && o.fighter).length;
    if (!inArena(ARENA, p) && sameCell(p.map(Math.floor), theme.arenaEntrance)) {
      brawl.enter(me, now);
      return this.teleport(me, startPoint(ARENA, fighters), now);
    }
    if (inArena(ARENA, p) && sameCell(cellOf(ARENA, p), ARENA.exit)) {
      delete me.fighter;
      return this.teleport(me, theme.spawn, now);
    }
    return this.toChannel(me, { t: 'peer_moved', peerId: me.peerId, ...me.pose });
  }

  private teleport(me: Participant, p: Vec3, now: number): Outbox {
    me.pose = { p, r: 0, a: 'idle' };
    me.lastMoveAt = now;
    return { send: [{ to: me.peerId, msg: { t: 'correction', p, r: 0 } }, ...this.toChannel(me, { t: 'peer_moved', peerId: me.peerId, ...me.pose }).send] };
  }

  private brawl(channel: number): BrawlSession {
    let b = this.brawls.get(channel);
    if (!b) this.brawls.set(channel, (b = new BrawlSession(ARENA, TUNING)));
    return b;
  }

  // The bucket is taken before the await, so a message arriving meanwhile cannot spend the same token.
  private async chat(me: Participant, conn: Conn, msg: Extract<ClientMessage, { t: 'chat' }>, now: number): Promise<Outbox> {
    const taken = conn.chats.take(now);
    if (!taken.ok) return { send: [{ to: me.peerId, msg: { t: 'rate_limited', scope: 'chat', retryAfterMs: taken.retryAfterMs, nonce: msg.nonce } }] };
    // Unique within the room: the sequence restarts after hibernation, but by then the clock has moved on.
    const fields: ChatFields = { messageId: `m_${now.toString(36)}.${++this.chatSeq}`, nickname: me.nickname, text: this.deps.filter(msg.text), sentAt: now, channel: me.channel };
    const out: Chat = { t: 'chat', ...fields, peerId: me.peerId, sig: await this.deps.sign(fields) };
    return {
      send: this.joined()
        .filter((p) => p.channel === me.channel)
        .map((p) => ({ to: p.peerId, msg: p === me && msg.nonce !== undefined ? { ...out, nonce: msg.nonce } : out })),
    };
  }

  private bad(peerId: string, conn: Conn, now: number): Outbox {
    conn.bad = [...conn.bad.filter((at) => now - at < BAD_WINDOW_MS), now];
    const send = [{ to: peerId, msg: { t: 'error', code: 'bad_message' } as const }];
    return conn.bad.length >= BAD_LIMIT ? { send, close: { to: peerId, code: CLOSE.badMessages } } : { send };
  }

  private members(channel: number): Participant[] {
    return this.joined().filter((p) => p.channel === channel);
  }

  private joined(): Participant[] {
    return [...this.conns.values()].flatMap((c) => (c.participant ? [c.participant] : []));
  }

  // Everyone else in my channel.
  private toChannel(me: Participant, msg: ServerMessage): Outbox {
    return { send: this.joined().filter((p) => p.channel === me.channel && p.peerId !== me.peerId).map((p) => ({ to: p.peerId, msg })) };
  }
}

const peerView = ({ peerId, nickname, avatarId, pose }: Participant) => ({ peerId, nickname, avatarId, ...pose });
