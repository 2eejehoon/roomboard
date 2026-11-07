import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { nicknameFor } from '../../src/core/identity.ts';
import { CLOSE } from '../../src/core/protocol.ts';
import { createRoomData } from '../../src/core/room-data.ts';
import { connect, deviceKey, insertRoom, joinRoom } from './rooms-helpers.ts';

const ws = (roomId: string, headers: HeadersInit = { Upgrade: 'websocket' }) =>
  exports.default.fetch(`https://roomboard.test/api/rooms/${roomId}/ws`, { headers });

describe('room WebSocket', () => {
  it('join gets welcome; the other participant gets peer_joined', async () => {
    const roomId = await insertRoom();
    const a = await joinRoom(roomId, 1);
    expect(a.welcome).toMatchObject({ channel: 1, peers: [], room: { id: roomId, title: '테스트 방', roomData: createRoomData('cafe') } });
    const b = await joinRoom(roomId, 2);
    expect(b.welcome.peers).toEqual([expect.objectContaining({ peerId: a.welcome.you.peerId, nickname: nicknameFor(deviceKey(1)) })]);
    expect(await a.next()).toEqual({ t: 'peer_joined', peer: expect.objectContaining({ peerId: b.welcome.you.peerId }) });
  });

  it('forwards a move to the other participant and tells them when the mover closes', async () => {
    const roomId = await insertRoom();
    const a = await joinRoom(roomId, 1);
    const b = await joinRoom(roomId, 2);
    await a.next(); // peer_joined
    await new Promise((r) => setTimeout(r, 200)); // stay under 8 m/s from the spawn
    b.send({ t: 'move', p: [0.5, 0, 4], r: 1, a: 'walk' });
    expect(await a.next()).toEqual({ t: 'peer_moved', peerId: b.welcome.you.peerId, p: [0.5, 0, 4], r: 1, a: 'walk' });
    b.ws.close(1000);
    expect(await a.next()).toEqual({ t: 'peer_left', peerId: b.welcome.you.peerId });
  });

  it('answers text ping with pong without a join', async () => {
    const c = await connect(await insertRoom());
    const pong = new Promise((resolve) => c.ws.addEventListener('message', (e) => resolve(e.data)));
    c.send('ping');
    expect(await pong).toBe('pong');
  });

  it('closes binary frames with 1003 and messages over 2KB with 1009', async () => {
    const roomId = await insertRoom();
    const bin = await connect(roomId);
    bin.ws.send(new Uint8Array([1, 2, 3]));
    expect(await bin.closed).toBe(CLOSE.binary);
    const big = await joinRoom(roomId, 1);
    big.send({ t: 'chat', text: 'x'.repeat(2100) });
    expect(await big.closed).toBe(CLOSE.tooLarge);
  });

  it('closes with 4000 when no join arrives within 5 seconds', { timeout: 15_000 }, async () => {
    const c = await connect(await insertRoom());
    const started = Date.now();
    expect(await c.closed).toBe(CLOSE.joinTimeout);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
  });

  it('after hibernation a newcomer still sees the earlier participant at their last position', async () => {
    const roomId = await insertRoom();
    const a = await joinRoom(roomId, 1);
    await new Promise((r) => setTimeout(r, 200));
    const b = await joinRoom(roomId, 2);
    await a.next(); // peer_joined
    a.send({ t: 'move', p: [0.5, 0, 4], r: 2, a: 'idle' });
    await b.next(); // peer_moved: the DO has the pose before it is evicted
    await evictDurableObject(env.ROOM.getByName(roomId));
    const c = await joinRoom(roomId, 3);
    expect(c.welcome.peers).toEqual(
      expect.arrayContaining([expect.objectContaining({ peerId: a.welcome.you.peerId, p: [0.5, 0, 4], r: 2, a: 'idle' })]),
    );
    expect(c.welcome.peers).toHaveLength(2);
  });

  it('a close that wakes the DO from hibernation still tells the channel and reschedules online_count', async () => {
    const roomId = await insertRoom();
    const stub = env.ROOM.getByName(roomId);
    const a = await joinRoom(roomId, 1);
    const b = await joinRoom(roomId, 2);
    await a.next(); // peer_joined
    await runDurableObjectAlarm(stub); // clear the pending online_count alarm
    await evictDurableObject(stub);
    b.ws.close(1000);
    expect(await a.next()).toEqual({ t: 'peer_left', peerId: b.welcome.you.peerId });
    await expect.poll(() => runInDurableObject(stub, (_o, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it('rejects a missing room with 404, a deleted one with 410 and a plain GET with 426', async () => {
    expect((await ws('nosuchroom')).status).toBe(404);
    expect((await ws('bad id!')).status).toBe(404);
    const gone = await ws(await insertRoom({ deletedAt: 3000 }));
    expect(gone.status).toBe(410);
    expect(await gone.json()).toEqual({ code: 'gone' });
    expect((await ws(await insertRoom(), {})).status).toBe(426);
  });
});

describe('GET /api/rooms/:roomId', () => {
  it('returns the room', async () => {
    const roomId = await insertRoom();
    const res = await exports.default.fetch(`https://roomboard.test/api/rooms/${roomId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: roomId,
      title: '테스트 방',
      description: '설명',
      themeId: 'cafe',
      roomData: createRoomData('cafe'),
      onlineCount: 0,
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('404 for a missing room, 410 for a deleted one, and never exposes the password hash', async () => {
    expect((await exports.default.fetch('https://roomboard.test/api/rooms/nosuchroom')).status).toBe(404);
    const res = await exports.default.fetch(`https://roomboard.test/api/rooms/${await insertRoom({ deletedAt: 3000 })}`);
    expect(res.status).toBe(410);
    const ok = await exports.default.fetch(`https://roomboard.test/api/rooms/${await insertRoom()}`);
    expect(await ok.text()).not.toContain('password');
  });
});
