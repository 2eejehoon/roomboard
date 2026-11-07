import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRoomSocket } from '../../src/client/net/room-socket.ts';
import { RoomStore } from '../../src/client/state/room-store.ts';
import { createRoomData } from '../../src/core/room-data.ts';

const KEY = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const welcome = JSON.stringify({
  t: 'welcome',
  v: 1,
  you: { peerId: 'me', nickname: '느긋한 수달', avatarId: 'char-03' },
  channel: 1,
  room: { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') },
  peers: [],
  spawn: [0, 0, 4],
});

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;
  constructor() {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  moves() {
    return this.sent.filter((s) => s.startsWith('{"t":"move"')).map((s) => JSON.parse(s));
  }
}
const last = () => FakeSocket.all.at(-1)!;

function start(random = () => 0.5) {
  const store = new RoomStore();
  const socket = openRoomSocket({ url: 'wss://x/api/rooms/seedroom01/ws', deviceKey: KEY, store, WS: FakeSocket as never, random });
  return { store, socket };
}
function joined() {
  const ctx = start();
  last().open();
  last().receive(welcome);
  return ctx;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
});
afterEach(() => vi.useRealTimers());

describe('openRoomSocket', () => {
  it('joins on open and applies server messages to the store', () => {
    const { store } = start();
    expect(store.getState().connection).toBe('connecting');
    last().open();
    expect(JSON.parse(last().sent[0])).toEqual({ t: 'join', v: 1, deviceKey: KEY });
    last().receive(welcome);
    expect(store.getState()).toMatchObject({ connection: 'open', you: { nickname: '느긋한 수달' } });
  });

  it('sends a text ping every 20 seconds and ignores pong', () => {
    const { store } = joined();
    vi.advanceTimersByTime(40_000);
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(2);
    last().receive('pong');
    expect(store.getState().connection).toBe('open');
  });

  it('reconnects after 1, 2, 4, 8 and then 15 seconds, showing reconnecting meanwhile', () => {
    const { store } = joined();
    for (const delay of [1000, 2000, 4000, 8000, 15_000, 15_000]) {
      const count = FakeSocket.all.length;
      last().close(1006);
      expect(store.getState().connection).toBe('reconnecting');
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.all).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(count + 1);
    }
  });

  it('jitters the delay by ±20% and starts over after a welcome', () => {
    const { socket } = start(() => 0); // lowest jitter: 0.8×
    last().close(1006);
    vi.advanceTimersByTime(800);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    last().receive(welcome);
    last().close(1006);
    vi.advanceTimersByTime(800);
    expect(FakeSocket.all, 'back to the 1 s step').toHaveLength(3);
    socket.close();
  });

  it.each([1000, 1003, 1009, 4001, 4002, 4008])('does not reconnect after close code %i', (code) => {
    const { store } = joined();
    last().close(code);
    expect(store.getState()).toMatchObject({ connection: 'closed', closeCode: code });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('reconnects after a join timeout (4000)', () => {
    joined();
    last().close(4000);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('close() stops for good', () => {
    const { socket, store } = joined();
    socket.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(store.getState().connection).toBe('closed');
  });
});

describe('move throttle', () => {
  it('sends at most 5 moves a second, rounded, and the latest pose last', () => {
    const { socket, store } = joined();
    for (let i = 1; i <= 20; i++) {
      socket.move([i * 0.0123, 0, 4], 0, 'walk');
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(1000);
    const moves = last().moves();
    expect(moves.length).toBeLessThanOrEqual(6);
    expect(moves.at(-1)).toEqual({ t: 'move', p: [0.25, 0, 4], r: 0, a: 'walk' });
    expect(store.getState().you?.p).toEqual([0.25, 0, 4]);
    for (let i = 1; i < moves.length; i++) expect(moves[i]).not.toEqual(moves[i - 1]);
  });

  it('sends nothing when the pose does not change, and idle once when stopping', () => {
    const { socket } = joined();
    socket.move([0, 0, 4], 0, 'idle');
    vi.advanceTimersByTime(300);
    expect(last().moves(), 'the spawn pose is already known').toEqual([]);
    socket.move([0.5, 0, 4], 0, 'walk');
    vi.advanceTimersByTime(300);
    for (let i = 0; i < 5; i++) {
      socket.move([0.5, 0, 4], 0, 'idle');
      vi.advanceTimersByTime(300);
    }
    expect(last().moves().map((m) => m.a)).toEqual(['walk', 'idle']);
  });

  it('keeps sending moves after a reconnect that cut off a pending one', () => {
    const { socket } = joined();
    socket.move([0.1, 0, 4], 0, 'walk');
    socket.move([0.15, 0, 4], 0, 'walk'); // waits for the throttle
    last().close(1006);
    vi.advanceTimersByTime(1000);
    last().open();
    last().receive(welcome);
    vi.advanceTimersByTime(300);
    socket.move([0.2, 0, 4], 0, 'walk');
    vi.advanceTimersByTime(300);
    expect(last().moves()).toEqual([{ t: 'move', p: [0.2, 0, 4], r: 0, a: 'walk' }]);
  });

  it('drops moves while not connected', () => {
    const { socket } = start();
    socket.move([1, 0, 4], 0, 'walk');
    last().open();
    vi.advanceTimersByTime(1000);
    expect(last().moves()).toEqual([]);
  });
});
