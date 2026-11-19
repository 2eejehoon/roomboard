// One DO per room (research R6): Hibernation WebSockets in, RoomSession decides, results out.
import { DurableObject } from 'cloudflare:workers';
import { CLOSE } from '../core/protocol.ts';
import type { ArenaRecord } from '../core/brawl/brawl-session.ts';
import { RoomSession, type ChatFields, type Outbox, type Participant, type RoomInfo } from '../core/room-session.ts';
import { recordServerError } from './bug-reports.ts';
import { signChat } from './chat-sign.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { filter, requireRoom } from './rooms.ts';

// Socket attachment (data-model.md "Participant"), plus the connect time for the join deadline. No device key.
type Attachment = { peerId: string; connectedAt: number; participant: Participant | null };
const JOIN_TIMEOUT_MS = 5000;
const ONLINE_DEBOUNCE_MS = 2000;
// 004 R6: a channel's blocks are written at most every 2 s, a match change at once; while any arena:* key exists a cleanup
// alarm stays within 10 min.
const ARENA_WRITE_MS = 2000;
const ARENA_CLEANUP_MS = 10 * 60_000;
const ARENA = 'arena:';
const att = (ws: WebSocket) => ws.deserializeAttachment() as Attachment;

export class RoomDurableObject extends DurableObject<Env> {
  private readonly sockets = new Map<string, WebSocket>();
  private readonly left = new Set<string>();
  private loading?: Promise<RoomSession | null>;
  // The online_count last written (null after a wake). Brawl events share the alarm, so it writes D1 only on a change.
  private onlineWritten: number | null = null;
  // When the changed blocks are due to be written (memory only: a wake may lose the last 2 s, R6).
  private arenaDue: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    for (const ws of ctx.getWebSockets()) this.sockets.set(att(ws).peerId, ws);
  }

  async fetch(): Promise<Response> {
    const session = await this.session();
    if (!session) return new Response(null, { status: 404 }); // the Worker checked D1 just before; only a race lands here
    const [client, server] = Object.values(new WebSocketPair());
    const now = Date.now();
    const peerId = `p_${crypto.randomUUID().slice(0, 8)}`;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId, connectedAt: now, participant: null } satisfies Attachment);
    this.sockets.set(peerId, server);
    session.connect(peerId);
    await this.schedule(now + JOIN_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  // RPC (research R5): PBKDF2 needs more CPU than a Worker request has. Called before the room's row exists, so no session().
  hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  verifyPassword(password: string, stored: string): Promise<boolean> {
    return verifyPassword(password, stored);
  }

  // RPC after D1 has the edit (T083). The reset poses go into the attachments too, or a wake would bring the old ones back.
  async roomUpdated(room: RoomInfo, respawn: boolean): Promise<void> {
    const session = await this.session();
    if (!session) return;
    await this.deliver(session.update(room, respawn, Date.now()));
    await this.saveArenas(session, true);
    for (const ws of this.sockets.values()) {
      const participant = session.participant(att(ws).peerId);
      if (participant) ws.serializeAttachment({ ...att(ws), participant } satisfies Attachment);
    }
  }

  // RPC for the admin's arena reset (FR-040, R10): every channel back to the default, every arena:* key gone.
  async resetArenas(): Promise<void> {
    const session = await this.session();
    if (!session) return;
    const now = Date.now();
    const out = session.resetArenas(now);
    session.takeDirtyArenas();
    this.saveTouched(session, out);
    await this.deliver(out);
    await this.ctx.storage.delete([...(await this.ctx.storage.list({ prefix: ARENA })).keys()]);
    await this.scheduleEvents(session);
  }

  // RPC after D1 marks the room deleted (T083). Straight to the sockets: after a wake session() would read the 410 and know
  // nobody. Deletion is final, so this DO never builds a session again, and no peer_left goes out between the two.
  async roomDeleted(by: 'owner' | 'admin'): Promise<void> {
    this.loading = Promise.resolve(null);
    const sockets = [...this.sockets.values()];
    for (const ws of sockets) ws.send(JSON.stringify({ t: 'room_deleted', by }));
    for (const ws of sockets) await this.drop(ws, CLOSE.roomDeleted);
  }

  // FR-001: the runtime calls these directly, so no Hono onError sees what they throw. fetch() and the RPC methods are left
  // out: their errors reach the Worker route, which records them already.
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.recorded(() => this.onMessage(ws, message));
  }

  webSocketClose(ws: WebSocket): Promise<void> {
    return this.recorded(() => this.gone(ws));
  }

  webSocketError(ws: WebSocket): Promise<void> {
    return this.recorded(() => this.gone(ws));
  }

  alarm(): Promise<void> {
    return this.recorded(() => this.onAlarm());
  }

  // Still thrown afterwards, so the runtime behaves as before (an alarm is retried).
  private async recorded(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      await recordServerError(this.env, err instanceof Error ? err : new Error(String(err))).catch(() => {});
      throw err;
    }
  }

  private async onMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return this.drop(ws, CLOSE.binary);
    const session = await this.session();
    if (!session) return this.drop(ws, 1011);
    const { peerId, connectedAt } = att(ws);
    const wasJoined = session.participant(peerId) !== null;
    const now = Date.now();
    const out = await session.receive(peerId, message, now);
    const participant = session.participant(peerId);
    if (participant) ws.serializeAttachment({ peerId, connectedAt, participant } satisfies Attachment);
    this.saveTouched(session, out);
    await this.deliver(out);
    await this.saveArenas(session, true);
    if (!wasJoined && participant) await this.schedule(now + ONLINE_DEBOUNCE_MS);
    await this.arenaChanged(session, now);
    await this.scheduleEvents(session);
  }

  private async arenaChanged(session: RoomSession, now: number): Promise<void> {
    if (!session.dirty || this.arenaDue !== null) return;
    this.arenaDue = now + ARENA_WRITE_MS;
    await this.schedule(this.arenaDue);
  }

  // R6: writes the changed channels (an empty diff deletes the key) and drops the keys of channels nobody is in. Returns the
  // cleanup alarm time while any key is left.
  private async keepArenas(session: RoomSession | null, now: number): Promise<number> {
    // Due with no session (a deleted room, D1 down): nothing to write, and a past due time would ring the alarm forever (PR #91 review).
    if (this.arenaDue !== null && this.arenaDue <= now) {
      this.arenaDue = null;
      if (session) await this.saveArenas(session, false);
    }
    // From the attachments, not the session: a session that failed to load (D1 down) must not read as an empty room (PR #91 review).
    const occupied = new Set([...this.sockets.values()].flatMap((ws) => att(ws).participant?.channel ?? []));
    const keys = [...(await this.ctx.storage.list({ prefix: ARENA })).keys()];
    const empty = keys.filter((k) => !occupied.has(Number(k.slice(ARENA.length))));
    await this.ctx.storage.delete(empty);
    const due = this.arenaDue ?? Infinity;
    return keys.length > empty.length ? Math.min(due, now + ARENA_CLEANUP_MS) : due;
  }

  // The whole record of each changed channel; no blocks and no match deletes the key. matchOnly: a match change, written at once.
  private async saveArenas(session: RoomSession, matchOnly: boolean): Promise<void> {
    for (const { channel, record } of session.takeDirtyArenas(matchOnly)) {
      if (record.blocks.length || record.match) await this.ctx.storage.put(`${ARENA}${channel}`, record);
      else await this.ctx.storage.delete(`${ARENA}${channel}`);
    }
  }

  // Closes sockets that missed the join deadline, runs due brawl events (004 R2) and writes online_count; one alarm serves
  // them all (no setTimeout, research R6).
  private async onAlarm(): Promise<void> {
    const now = Date.now();
    let next = Infinity;
    const session = await this.session();
    if (session) {
      const out = session.runEvents(now);
      this.saveTouched(session, out);
      await this.deliver(out);
      await this.saveArenas(session, true);
      await this.arenaChanged(session, now);
      next = Math.min(next, session.nextEventAt() ?? Infinity);
    }
    next = Math.min(next, await this.keepArenas(session, now));
    for (const ws of [...this.sockets.values()]) {
      const { participant, connectedAt } = att(ws);
      if (participant) continue;
      if (connectedAt + JOIN_TIMEOUT_MS <= now) await this.drop(ws, CLOSE.joinTimeout);
      else next = Math.min(next, connectedAt + JOIN_TIMEOUT_MS);
    }
    const online = [...this.sockets.values()].filter((ws) => att(ws).participant).length;
    if (online !== this.onlineWritten) {
      await this.env.DB.prepare('UPDATE rooms SET online_count = ? WHERE id = ?').bind(online, this.ctx.id.name!).run();
      this.onlineWritten = online;
    }
    if (next < Infinity) await this.schedule(next);
  }

  // Built from D1 and the attachments on first use after a wake; not cached while the row is missing, because US3 calls
  // this DO (password hash) before inserting the row.
  private session(): Promise<RoomSession | null> {
    this.loading ??= requireRoom(this.env.DB, this.ctx.id.name!)
      .then(async ({ id, title, description, roomData }) => {
        const sign = (c: ChatFields) => signChat(this.env.SERVER_SECRET, id, c);
        const session = new RoomSession({ id, title, description, roomData }, { filter, sign });
        for (const ws of this.sockets.values()) {
          const { peerId, participant } = att(ws);
          if (participant) session.restore(participant);
          else session.connect(peerId);
        }
        // R6: the built blocks of channels someone is in; a key for an empty channel is dropped.
        const occupied = session.occupied();
        for (const [key, value] of await this.ctx.storage.list<ArenaRecord>({ prefix: ARENA })) {
          const channel = Number(key.slice(ARENA.length));
          if (occupied.has(channel)) session.restoreArena(channel, value);
          else await this.ctx.storage.delete(key);
        }
        return session;
      })
      // Also a throw while reading the stored arenas: the next use tries again (PR #91 review).
      .catch(() => {
        this.loading = undefined;
        return null;
      });
    return this.loading;
  }

  // 004 R6: whoever a brawl message names (hit, new launch, landed, knocked out, respawned, a match's players) changed state, so
  // their attachment is rewritten.
  private saveTouched(session: RoomSession, out: Outbox): void {
    const ids = new Set<string>();
    for (const { msg } of out.send) {
      if (msg.t === 'swing') for (const h of msg.hits) ids.add(h.peerId);
      else if (msg.t === 'launch' || msg.t === 'landed' || msg.t === 'knocked_out' || msg.t === 'respawned') ids.add(msg.peerId);
      else if (msg.t === 'match' && msg.state !== 'cancelled') for (const p of msg.state === 'running' ? msg.players : msg.ranks) ids.add(p.peerId);
    }
    for (const id of ids) {
      const ws = this.sockets.get(id);
      const participant = session.participant(id);
      if (ws && participant) ws.serializeAttachment({ ...att(ws), participant } satisfies Attachment);
    }
  }

  private async deliver(out: Outbox): Promise<void> {
    for (const { to, msg } of out.send) this.sockets.get(to)?.send(JSON.stringify(msg));
    const ws = out.close && this.sockets.get(out.close.to);
    if (ws) await this.drop(ws, out.close!.code);
  }

  private async drop(ws: WebSocket, code: number): Promise<void> {
    ws.close(code);
    await this.gone(ws);
  }

  private async gone(ws: WebSocket): Promise<void> {
    const { peerId, participant } = att(ws);
    // Our own close() and the close event that follows both land here; handle each socket once per wake.
    if (this.left.has(peerId)) return;
    this.left.add(peerId);
    this.sockets.delete(peerId);
    const session = await this.session();
    if (!session) return;
    // A socket whose close wakes the DO is already missing from getWebSockets(), so the session learns it from the attachment.
    if (participant && !session.participant(peerId)) session.restore(participant);
    const wasJoined = session.participant(peerId) !== null;
    const out = session.leave(peerId, Date.now());
    this.saveTouched(session, out);
    await this.deliver(out);
    await this.saveArenas(session, true);
    if (wasJoined) await this.schedule(Date.now() + ONLINE_DEBOUNCE_MS);
    // FR-018: the last one out takes the channel's arena with them.
    const channel = session.participant(peerId)?.channel ?? participant?.channel;
    if (channel !== undefined && !session.occupied().has(channel)) await this.ctx.storage.delete(`${ARENA}${channel}`);
  }

  private async scheduleEvents(session: RoomSession): Promise<void> {
    const at = session.nextEventAt();
    if (at !== null) await this.schedule(at);
  }

  // setAlarm replaces the pending alarm, so keep whichever is sooner.
  private async schedule(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }
}
