// One DO per room (research R6): Hibernation WebSockets in, RoomSession decides, results out.
import { DurableObject } from 'cloudflare:workers';
import { CLOSE } from '../core/protocol.ts';
import { RoomSession, type ChatFields, type Outbox, type Participant, type RoomInfo } from '../core/room-session.ts';
import { signChat } from './chat-sign.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { filter, requireRoom } from './rooms.ts';

// Socket attachment (data-model.md "Participant"), plus the connect time for the join deadline. No device key.
type Attachment = { peerId: string; connectedAt: number; participant: Participant | null };
const JOIN_TIMEOUT_MS = 5000;
const ONLINE_DEBOUNCE_MS = 2000;
const att = (ws: WebSocket) => ws.deserializeAttachment() as Attachment;

export class RoomDurableObject extends DurableObject<Env> {
  private readonly sockets = new Map<string, WebSocket>();
  private readonly left = new Set<string>();
  private loading?: Promise<RoomSession | null>;

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
    for (const ws of this.sockets.values()) {
      const participant = session.participant(att(ws).peerId);
      if (participant) ws.serializeAttachment({ ...att(ws), participant } satisfies Attachment);
    }
  }

  // RPC after D1 marks the room deleted (T083). Straight to the sockets: after a wake session() would read the 410 and know
  // nobody. Deletion is final, so this DO never builds a session again, and no peer_left goes out between the two.
  async roomDeleted(by: 'owner' | 'admin'): Promise<void> {
    this.loading = Promise.resolve(null);
    const sockets = [...this.sockets.values()];
    for (const ws of sockets) ws.send(JSON.stringify({ t: 'room_deleted', by }));
    for (const ws of sockets) await this.drop(ws, CLOSE.roomDeleted);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return this.drop(ws, CLOSE.binary);
    const session = await this.session();
    if (!session) return this.drop(ws, 1011);
    const { peerId, connectedAt } = att(ws);
    const wasJoined = session.participant(peerId) !== null;
    const now = Date.now();
    const out = await session.receive(peerId, message, now);
    const participant = session.participant(peerId);
    if (participant) ws.serializeAttachment({ peerId, connectedAt, participant } satisfies Attachment);
    await this.deliver(out);
    if (!wasJoined && participant) await this.schedule(now + ONLINE_DEBOUNCE_MS);
  }

  webSocketClose(ws: WebSocket): Promise<void> {
    return this.gone(ws);
  }

  webSocketError(ws: WebSocket): Promise<void> {
    return this.gone(ws);
  }

  // Closes sockets that missed the join deadline and writes online_count; one alarm serves both (no setTimeout, research R6).
  async alarm(): Promise<void> {
    const now = Date.now();
    let next = Infinity;
    for (const ws of [...this.sockets.values()]) {
      const { participant, connectedAt } = att(ws);
      if (participant) continue;
      if (connectedAt + JOIN_TIMEOUT_MS <= now) await this.drop(ws, CLOSE.joinTimeout);
      else next = Math.min(next, connectedAt + JOIN_TIMEOUT_MS);
    }
    const online = [...this.sockets.values()].filter((ws) => att(ws).participant).length;
    await this.env.DB.prepare('UPDATE rooms SET online_count = ? WHERE id = ?').bind(online, this.ctx.id.name!).run();
    if (next < Infinity) await this.schedule(next);
  }

  // Built from D1 and the attachments on first use after a wake; not cached while the row is missing, because US3 calls
  // this DO (password hash) before inserting the row.
  private session(): Promise<RoomSession | null> {
    this.loading ??= requireRoom(this.env.DB, this.ctx.id.name!).then(
      ({ id, title, description, roomData }) => {
        const sign = (c: ChatFields) => signChat(this.env.SERVER_SECRET, id, c);
        const session = new RoomSession({ id, title, description, roomData }, { filter, sign });
        for (const ws of this.sockets.values()) {
          const { peerId, participant } = att(ws);
          if (participant) session.restore(participant);
          else session.connect(peerId);
        }
        return session;
      },
      () => {
        this.loading = undefined;
        return null;
      },
    );
    return this.loading;
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
    await this.deliver(session.leave(peerId));
    if (wasJoined) await this.schedule(Date.now() + ONLINE_DEBOUNCE_MS);
  }

  // setAlarm replaces the pending alarm, so keep whichever is sooner.
  private async schedule(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }
}
