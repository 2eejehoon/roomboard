// What the 3D and 2D screens both read (plan.md). Server messages are applied here and nowhere else.
import type { ServerMessage } from '../../core/protocol.ts';
import type { Pose, RoomInfo } from '../../core/room-session.ts';
import type { Vec3 } from '../../core/themes.ts';

type Welcome = Extract<ServerMessage, { t: 'welcome' }>;
export type Peer = Welcome['peers'][number];
export type Connection = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type RoomState = {
  room: RoomInfo | null;
  you: (Welcome['you'] & Pose) | null;
  channel: number | null;
  peers: Peer[];
  chat: Extract<ServerMessage, { t: 'chat' }>[];
  connection: Connection;
  closeCode: number | null;
};

const initial: RoomState = { room: null, you: null, channel: null, peers: [], chat: [], connection: 'connecting', closeCode: null };

export class RoomStore {
  private state = initial;
  private readonly listeners = new Set<() => void>();

  getState = (): RoomState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(msg: ServerMessage): void {
    const s = this.state;
    switch (msg.t) {
      case 'welcome':
        return this.set({ room: msg.room, you: { ...msg.you, p: msg.spawn, r: 0, a: 'idle' }, channel: msg.channel, peers: msg.peers, connection: 'open' });
      case 'peer_joined':
        return this.set({ peers: [...s.peers.filter((p) => p.peerId !== msg.peer.peerId), msg.peer] });
      case 'peer_left':
        return this.set({ peers: s.peers.filter((p) => p.peerId !== msg.peerId) });
      case 'peer_moved':
        return this.set({ peers: s.peers.map((p) => (p.peerId === msg.peerId ? { ...p, p: msg.p, r: msg.r, a: msg.a } : p)) });
      case 'correction':
        return s.you ? this.set({ you: { ...s.you, p: msg.p, r: msg.r } }) : undefined;
      // chat (US4), room_updated / room_deleted (US6) are applied by those stories.
    }
  }

  moveSelf(p: Vec3, r: number, a: Pose['a']): void {
    if (this.state.you) this.set({ you: { ...this.state.you, p, r, a } });
  }

  // welcome opens the connection. Peers from before a drop are stale; the next welcome lists them again.
  setConnection(connection: 'reconnecting' | 'closed', closeCode: number | null = null): void {
    this.set({ connection, closeCode, peers: [] });
  }

  private set(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
