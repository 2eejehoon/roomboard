// Pure room state machine (plan.md): participants in, messages and closes out. The room DO feeds it socket events.
import { assignChannel } from './channels.ts';
import { avatarFor, nicknameFor } from './identity.ts';
import { validateMove } from './movement.ts';
import { CLOSE, parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol.ts';
import { MOVE_RATE, RateBucket } from './rate-bucket.ts';
import { THEMES, type Vec3 } from './themes.ts';

export type RoomInfo = Extract<ServerMessage, { t: 'welcome' }>['room'];
export type Pose = { p: Vec3; r: number; a: 'idle' | 'walk' | 'run' | 'jump' };
// data-model.md "Participant": the socket attachment. Never holds the device key.
export type Participant = { peerId: string; nickname: string; avatarId: string; channel: number; pose: Pose; lastMoveAt: number };
export type Outbox = { send: { to: string; msg: ServerMessage }[]; close?: { to: string; code: number } };

const BAD_LIMIT = 5;
const BAD_WINDOW_MS = 10_000;
const round = (n: number) => Math.round(n * 100) / 100;

// Rate bucket and bad-message times live only in memory; they reset when the DO hibernates, which is fine for abuse limits.
type Conn = { participant: Participant | null; moves: RateBucket; bad: number[] };

export class RoomSession {
  private readonly conns = new Map<string, Conn>();
  private readonly room: RoomInfo;

  constructor(room: RoomInfo) {
    this.room = room;
  }

  connect(peerId: string): void {
    this.conns.set(peerId, { participant: null, moves: new RateBucket(MOVE_RATE), bad: [] });
  }

  restore(participant: Participant): void {
    this.conns.set(participant.peerId, { participant, moves: new RateBucket(MOVE_RATE), bad: [] });
  }

  participant(peerId: string): Participant | null {
    return this.conns.get(peerId)?.participant ?? null;
  }

  get joinedCount(): number {
    return this.joined().length;
  }

  receive(peerId: string, raw: string, now: number): Outbox {
    const conn = this.conns.get(peerId);
    if (!conn) return { send: [] };
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return parsed.reason === 'too_large' ? { send: [], close: { to: peerId, code: CLOSE.tooLarge } } : this.bad(peerId, conn, now);
    const msg = parsed.msg;
    if (msg.t === 'join') return conn.participant ? this.bad(peerId, conn, now) : this.join(peerId, conn, msg, now);
    const me = conn.participant;
    if (!me) return { send: [{ to: peerId, msg: { t: 'error', code: 'not_joined' } }] };
    if (msg.t === 'move') return this.move(me, conn, msg, now);
    return { send: [] }; // chat: US4 (T068~)
  }

  leave(peerId: string): Outbox {
    const me = this.participant(peerId);
    this.conns.delete(peerId);
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
    };
    return { send: [{ to: peerId, msg: welcome }, ...this.toChannel(me, { t: 'peer_joined', peer: peerView(me) }).send] };
  }

  private move(me: Participant, conn: Conn, msg: Extract<ClientMessage, { t: 'move' }>, now: number): Outbox {
    if (!conn.moves.take(now).ok) return { send: [] };
    const p = msg.p.map(round) as Vec3;
    if (!validateMove({ p: me.pose.p, at: me.lastMoveAt }, p, now, THEMES[this.room.roomData.themeId].bounds)) {
      return { send: [{ to: me.peerId, msg: { t: 'correction', p: me.pose.p, r: me.pose.r } }] };
    }
    me.pose = { p, r: round(msg.r), a: msg.a };
    me.lastMoveAt = now;
    return this.toChannel(me, { t: 'peer_moved', peerId: me.peerId, ...me.pose });
  }

  private bad(peerId: string, conn: Conn, now: number): Outbox {
    conn.bad = [...conn.bad.filter((at) => now - at < BAD_WINDOW_MS), now];
    const send = [{ to: peerId, msg: { t: 'error', code: 'bad_message' } as const }];
    return conn.bad.length >= BAD_LIMIT ? { send, close: { to: peerId, code: CLOSE.badMessages } } : { send };
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
