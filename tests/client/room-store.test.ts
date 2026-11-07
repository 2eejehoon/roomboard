import { describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../src/core/protocol.ts';
import { createRoomData } from '../../src/core/room-data.ts';
import { RoomStore } from '../../src/client/state/room-store.ts';

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const peer = (peerId: string, p: [number, number, number] = [0, 0, 4]) => ({ peerId, nickname: `닉 ${peerId}`, avatarId: 'char-01', p, r: 0, a: 'idle' as const });
const welcome: ServerMessage = {
  t: 'welcome',
  v: 1,
  you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
  channel: 2,
  room,
  peers: [peer('a')],
  spawn: [0, 0, 4],
};

describe('RoomStore', () => {
  it('starts connecting with nothing known', () => {
    expect(new RoomStore().getState()).toEqual({ room: null, you: null, channel: null, peers: [], chat: [], connection: 'connecting', closeCode: null });
  });

  it('welcome sets me at the spawn, the channel, the room and the peers, and marks the connection open', () => {
    const s = new RoomStore();
    s.apply(welcome);
    expect(s.getState()).toMatchObject({
      room,
      you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03', p: [0, 0, 4], r: 0, a: 'idle' },
      channel: 2,
      peers: [peer('a')],
      connection: 'open',
    });
  });

  it('peer_joined, peer_moved and peer_left update the peer list', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.apply({ t: 'peer_joined', peer: peer('b') });
    s.apply({ t: 'peer_moved', peerId: 'b', p: [1, 0, 2], r: 1.5, a: 'walk' });
    expect(s.getState().peers).toEqual([peer('a'), { ...peer('b', [1, 0, 2]), r: 1.5, a: 'walk' }]);
    s.apply({ t: 'peer_left', peerId: 'a' });
    expect(s.getState().peers.map((p) => p.peerId)).toEqual(['b']);
  });

  it('correction and my own moves change my pose', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.moveSelf([1, 0, 3], 0.5, 'walk');
    expect(s.getState().you).toMatchObject({ p: [1, 0, 3], r: 0.5, a: 'walk' });
    s.apply({ t: 'correction', p: [0, 0, 4], r: 0 });
    expect(s.getState().you).toMatchObject({ p: [0, 0, 4], r: 0 });
  });

  it('a reconnect forgets the old peers until the next welcome; closing keeps the close code', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.setConnection('reconnecting');
    expect(s.getState()).toMatchObject({ connection: 'reconnecting', peers: [] });
    s.setConnection('closed', 4001);
    expect(s.getState()).toMatchObject({ connection: 'closed', closeCode: 4001 });
  });

  it('tells subscribers about every change with a new state object', () => {
    const s = new RoomStore();
    const listener = vi.fn();
    const unsubscribe = s.subscribe(listener);
    const before = s.getState();
    s.apply(welcome);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.getState()).not.toBe(before);
    unsubscribe();
    s.apply({ t: 'peer_left', peerId: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
