// What the 3D and 2D screens both read (plan.md). Server messages are applied here and nowhere else.
import type { ServerMessage } from '../../core/protocol.ts';
import type { Pose, RoomInfo } from '../../core/room-session.ts';
import { THEMES, type Vec3 } from '../../core/themes.ts';

type Welcome = Extract<ServerMessage, { t: 'welcome' }>;
export type Peer = Welcome['peers'][number];
// Join and leave notices for the 2D live region (screens.md S3 2D); welcome after a reconnect adds none.
export type Notice = { id: number; kind: 'joined' | 'left'; nickname: string };
export type Connection = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type RoomState = {
  room: RoomInfo | null;
  you: (Welcome['you'] & Pose) | null;
  channel: number | null;
  peers: Peer[];
  chat: Extract<ServerMessage, { t: 'chat' }>[];
  // retryAfterMs of my last rate_limited chat, until that wait is over.
  chatLimited: number | null;
  notices: Notice[];
  connection: Connection;
  closeCode: number | null;
};

const initial: RoomState = { room: null, you: null, channel: null, peers: [], chat: [], chatLimited: null, notices: [], connection: 'connecting', closeCode: null };

export class RoomStore {
  private state = initial;
  private readonly listeners = new Set<() => void>();
  private noticeId = 0;
  private limitTimer?: ReturnType<typeof setTimeout>;

  getState = (): RoomState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(msg: ServerMessage): void {
    const s = this.state;
    switch (msg.t) {
      case 'welcome':
        // A reconnect into another channel must not mix the old channel's chat into the new one.
        return this.set({ room: msg.room, you: { ...msg.you, p: msg.spawn, r: 0, a: 'idle' }, channel: msg.channel, peers: msg.peers, connection: 'open', chat: msg.channel === s.channel ? s.chat : [] });
      case 'peer_joined':
        return this.set({ peers: [...s.peers.filter((p) => p.peerId !== msg.peer.peerId), msg.peer], notices: this.notice('joined', msg.peer.nickname) });
      case 'peer_left': {
        const gone = s.peers.find((p) => p.peerId === msg.peerId);
        return gone ? this.set({ peers: s.peers.filter((p) => p !== gone), notices: this.notice('left', gone.nickname) }) : undefined;
      }
      case 'peer_moved':
        return this.set({ peers: s.peers.map((p) => (p.peerId === msg.peerId ? { ...p, p: msg.p, r: msg.r, a: msg.a } : p)) });
      case 'correction':
        return s.you ? this.set({ you: { ...s.you, p: msg.p, r: msg.r } }) : undefined;
      case 'chat':
        // The server keeps no chat, so the last 100 are all there is to scroll back to.
        return this.set({ chat: [...s.chat, msg].slice(-100) });
      case 'rate_limited':
        clearTimeout(this.limitTimer);
        this.limitTimer = setTimeout(() => this.set({ chatLimited: null }), msg.retryAfterMs);
        return this.set({ chatLimited: msg.retryAfterMs });
      case 'room_updated': {
        // A new theme: everyone starts again at its spawn, as the server just did (RoomSession.update).
        if (msg.room.roomData.themeId === s.room?.roomData.themeId) return this.set({ room: msg.room });
        const spawn = { p: THEMES[msg.room.roomData.themeId].spawn, r: 0, a: 'idle' } as const;
        return this.set({ room: msg.room, you: s.you && { ...s.you, ...spawn }, peers: s.peers.map((p) => ({ ...p, ...spawn })) });
      }
      // room_deleted: the 4001 close that follows ends the connection (room-socket.ts).
    }
  }

  moveSelf(p: Vec3, r: number, a: Pose['a']): void {
    if (this.state.you) this.set({ you: { ...this.state.you, p, r, a } });
  }

  // welcome opens the connection. Peers from before a drop are stale; the next welcome lists them again.
  setConnection(connection: 'reconnecting' | 'closed', closeCode: number | null = null): void {
    this.set({ connection, closeCode, peers: [] });
  }

  private notice(kind: Notice['kind'], nickname: string): Notice[] {
    return [...this.state.notices, { id: ++this.noticeId, kind, nickname }].slice(-5);
  }

  private set(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
