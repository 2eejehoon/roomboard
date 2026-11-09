// Pure room state machine (plan.md): participants in, messages and closes out. The room DO feeds it socket events.
import { assignChannel } from './channels.ts';
import { avatarFor, nicknameFor } from './identity.ts';
import { validateMove } from './movement.ts';
import { CLOSE, parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from './protocol.ts';
import { CHAT_RATE, MOVE_RATE, RateBucket } from './rate-bucket.ts';
import { THEMES, type Vec3 } from './themes.ts';

export type RoomInfo = Extract<ServerMessage, { t: 'welcome' }>['room'];
export type Pose = { p: Vec3; r: number; a: 'idle' | 'walk' | 'run' | 'jump' };
// data-model.md "Participant": the socket attachment. Never holds the device key.
export type Participant = { peerId: string; nickname: string; avatarId: string; channel: number; pose: Pose; lastMoveAt: number };
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
type Conn = { participant: Participant | null; moves: RateBucket; chats: RateBucket; bad: number[] };
const newConn = (participant: Participant | null): Conn => ({ participant, moves: new RateBucket(MOVE_RATE), chats: new RateBucket(CHAT_RATE), bad: [] });

export class RoomSession {
  private readonly conns = new Map<string, Conn>();
  private room: RoomInfo;
  private readonly deps: SessionDeps;
  private chatSeq = 0;

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
    if (msg.t === 'move') return this.move(me, conn, msg, now);
    return this.chat(me, conn, msg, now);
  }

  // The owner's edit (T083), to every channel. respawn: the theme changed, so old poses mean nothing in the new bounds. The
  // Worker says so, because a session rebuilt after hibernation already holds the new room.
  update(room: RoomInfo, respawn: boolean, now: number): Outbox {
    this.room = room;
    const joined = this.joined();
    if (respawn) for (const p of joined) [p.pose, p.lastMoveAt] = [{ p: THEMES[room.roomData.themeId].spawn, r: 0, a: 'idle' }, now];
    return { send: joined.map((p) => ({ to: p.peerId, msg: { t: 'room_updated', room } })) };
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

  private joined(): Participant[] {
    return [...this.conns.values()].flatMap((c) => (c.participant ? [c.participant] : []));
  }

  // Everyone else in my channel.
  private toChannel(me: Participant, msg: ServerMessage): Outbox {
    return { send: this.joined().filter((p) => p.channel === me.channel && p.peerId !== me.peerId).map((p) => ({ to: p.peerId, msg })) };
  }
}

const peerView = ({ peerId, nickname, avatarId, pose }: Participant) => ({ peerId, nickname, avatarId, ...pose });
