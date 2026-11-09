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

let seq = 0;
const chat = (text: string): Extract<ServerMessage, { t: 'chat' }> => ({ t: 'chat', messageId: `m_${++seq}`, peerId: 'a', nickname: '닉 a', text, sentAt: 1000, channel: 2, sig: 's' });

describe('RoomStore', () => {
  it('starts connecting with nothing known', () => {
    expect(new RoomStore().getState()).toEqual({ room: null, you: null, channel: null, peers: [], chat: [], chatLimited: null, notices: [], connection: 'connecting', closeCode: null });
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

  // screens.md S3 2D: join and leave notices for aria-live come from the messages only (precedent 2026-11-07-2d-view-rules).
  it('peer_joined and peer_left add a notice with the nickname; a reconnect and the next welcome add none', () => {
    const s = new RoomStore();
    s.apply(welcome);
    expect(s.getState().notices).toEqual([]);
    s.apply({ t: 'peer_joined', peer: peer('b') });
    s.apply({ t: 'peer_left', peerId: 'a' });
    s.apply({ t: 'peer_left', peerId: 'nobody' });
    expect(s.getState().notices.map(({ kind, nickname }) => [kind, nickname])).toEqual([
      ['joined', '닉 b'],
      ['left', '닉 a'],
    ]);
    s.setConnection('reconnecting');
    s.apply(welcome);
    expect(s.getState().notices).toHaveLength(2);
    expect(new Set(s.getState().notices.map((n) => n.id)).size).toBe(2);
  });

  it('keeps only the last five notices', () => {
    const s = new RoomStore();
    s.apply(welcome);
    for (let i = 0; i < 7; i++) s.apply({ t: 'peer_joined', peer: peer(`n${i}`) });
    expect(s.getState().notices.map((n) => n.nickname)).toEqual(['닉 n2', '닉 n3', '닉 n4', '닉 n5', '닉 n6']);
  });

  it('appends chat in arrival order and keeps the last 100', () => {
    const s = new RoomStore();
    s.apply(welcome);
    for (let i = 0; i < 102; i++) s.apply(chat(`m${i}`));
    expect(s.getState().chat.map((c) => c.text)).toEqual(Array.from({ length: 100 }, (_, i) => `m${i + 2}`));
  });

  it('rate_limited shows the wait only until it is over (PR #26 review)', () => {
    vi.useFakeTimers();
    const s = new RoomStore();
    s.apply(welcome);
    s.apply({ t: 'rate_limited', scope: 'chat', retryAfterMs: 1800, nonce: 'c-6' });
    expect(s.getState().chatLimited).toBe(1800);
    vi.advanceTimersByTime(1000);
    s.apply({ t: 'rate_limited', scope: 'chat', retryAfterMs: 1500, nonce: 'c-7' });
    vi.advanceTimersByTime(1000);
    expect(s.getState().chatLimited, 'a newer wait replaces the older one').toBe(1500);
    vi.advanceTimersByTime(500);
    expect(s.getState().chatLimited).toBeNull();
    vi.useRealTimers();
  });

  it('a welcome into another channel forgets the old channel chat; the same channel keeps it (PR #26 review)', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.apply(chat('채널 2'));
    s.setConnection('reconnecting');
    s.apply(welcome);
    expect(s.getState().chat.map((c) => c.text)).toEqual(['채널 2']);
    s.setConnection('reconnecting');
    s.apply({ ...welcome, channel: 3 });
    expect(s.getState().chat).toEqual([]);
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

// T085: the owner's edit (websocket.md room_updated).
describe('RoomStore room_updated', () => {
  it('replaces the room; poses stay without a theme change', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.moveSelf([1, 0, 2], 0.5, 'walk');
    const edited = { ...room, title: '새 제목' };
    s.apply({ t: 'room_updated', room: edited });
    expect(s.getState()).toMatchObject({ room: edited, you: { p: [1, 0, 2] }, peers: [{ p: [0, 0, 4] }] });
  });

  it('a theme change puts me and the peers at the new spawn, as the server does', () => {
    const s = new RoomStore();
    s.apply(welcome);
    s.moveSelf([1, 0, 2], 0.5, 'walk');
    s.apply({ t: 'room_updated', room: { ...room, roomData: createRoomData('garden') } });
    expect(s.getState().you).toMatchObject({ p: [0, 0, 8], r: 0, a: 'idle' });
    expect(s.getState().peers).toEqual([expect.objectContaining({ peerId: 'a', p: [0, 0, 8], r: 0, a: 'idle' })]);
  });
});
