import { describe, expect, it } from 'vitest';
import { CHANNEL_CAPACITY } from '../../src/core/channels.ts';
import { insertRoom, joinRoom } from './rooms-helpers.ts';

// T075 (US5): the real DO splits channels at 20 and keeps channel 2 traffic away from channel 1.
describe('room DO channels', () => {
  it('the 21st joiner goes to channel 2, channel 1 never hears them, and a freed seat in channel 1 is reused', { timeout: 30_000 }, async () => {
    const roomId = await insertRoom();
    const first = [];
    for (let n = 1; n <= CHANNEL_CAPACITY; n++) first.push(await joinRoom(roomId, n));
    expect(first.map((c) => c.welcome.channel)).toEqual(Array(CHANNEL_CAPACITY).fill(1));
    const [a, b] = first;
    // a hears the 19 who joined after it; drain those peer_joined.
    for (let i = 1; i < CHANNEL_CAPACITY; i++) expect((await a.next()).t).toBe('peer_joined');

    const late = await joinRoom(roomId, 99);
    expect(late.welcome).toMatchObject({ channel: 2, peers: [] });
    await new Promise((r) => setTimeout(r, 200)); // stay under 8 m/s from the spawn
    late.send({ t: 'move', p: [0.5, 0, 4], r: 1, a: 'walk' });
    late.send({ t: 'chat', text: '채널 2에서 안녕' });
    expect((await late.next()).t).toBe('chat'); // own echo: the DO has handled both
    // The next thing a hears is b's chat, not anything from the 21st.
    b.send({ t: 'chat', text: '채널 1' });
    expect(await a.next()).toMatchObject({ t: 'chat', text: '채널 1', channel: 1 });

    first[CHANNEL_CAPACITY - 1].ws.close(1000);
    expect(await a.next()).toMatchObject({ t: 'peer_left' });
    const again = await joinRoom(roomId, 100);
    expect(again.welcome.channel).toBe(1);
    expect(await a.next()).toMatchObject({ t: 'peer_joined', peer: expect.objectContaining({ peerId: again.welcome.you.peerId }) });
  });
});
