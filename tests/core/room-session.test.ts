import { describe, expect, it } from 'vitest';
import { avatarFor, nicknameFor } from '../../src/core/identity.ts';
import { CLOSE, type ServerMessage } from '../../src/core/protocol.ts';
import { createRoomData } from '../../src/core/room-data.ts';
import { RoomSession, type Outbox } from '../../src/core/room-session.ts';
import { CHANNEL_CAPACITY } from '../../src/core/channels.ts';
import { THEMES } from '../../src/core/themes.ts';

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const spawn = THEMES.cafe.spawn;
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const join = (n = 1) => JSON.stringify({ t: 'join', v: 1, deviceKey: key(n) });
const move = (p: number[], r = 0, a = 'walk') => JSON.stringify({ t: 'move', p, r, a });
const to = (out: Outbox, peerId: string) => out.send.filter((s) => s.to === peerId).map((s) => s.msg);
const only = <T extends ServerMessage['t']>(out: Outbox, peerId: string, t: T) => {
  const msgs = to(out, peerId);
  expect(msgs.map((m) => m.t)).toEqual([t]);
  return msgs[0] as Extract<ServerMessage, { t: T }>;
};

function joined(...peers: string[]) {
  const s = new RoomSession(room);
  peers.forEach((id, i) => {
    s.connect(id);
    s.receive(id, join(i + 1), 0);
  });
  return s;
}

describe('RoomSession join', () => {
  it('welcomes the joiner with identity from the device key, spawn and same-channel peers; tells the others', () => {
    const s = joined('a');
    s.connect('b');
    const out = s.receive('b', join(2), 100);
    const welcome = only(out, 'b', 'welcome');
    expect(welcome).toMatchObject({
      v: 1,
      you: { peerId: 'b', nickname: nicknameFor(key(2)), avatarId: avatarFor(key(2)) },
      channel: 1,
      room,
      spawn,
    });
    expect(welcome.peers).toEqual([{ peerId: 'a', nickname: nicknameFor(key(1)), avatarId: avatarFor(key(1)), p: spawn, r: 0, a: 'idle' }]);
    expect(only(out, 'a', 'peer_joined').peer).toEqual({ ...welcome.you, p: spawn, r: 0, a: 'idle' });
    expect(out.close).toBeUndefined();
  });

  it('puts the 21st participant in channel 2, who sees and is seen by nobody in channel 1', () => {
    const ids = Array.from({ length: CHANNEL_CAPACITY }, (_, i) => `p${i}`);
    const s = joined(...ids);
    s.connect('late');
    const out = s.receive('late', join(99), 0);
    const welcome = only(out, 'late', 'welcome');
    expect(welcome.channel).toBe(2);
    expect(welcome.peers).toEqual([]);
    expect(out.send).toHaveLength(1);
    expect(s.participant('late')?.channel).toBe(2);
  });

  it('answers a second join with bad_message', () => {
    const s = joined('a');
    expect(only(s.receive('a', join(1), 10), 'a', 'error')).toEqual({ t: 'error', code: 'bad_message' });
  });

  it('closes with 4002 on an unsupported protocol version', () => {
    const s = new RoomSession(room);
    s.connect('a');
    const out = s.receive('a', JSON.stringify({ t: 'join', v: 2, deviceKey: key(1) }), 0);
    expect(only(out, 'a', 'error')).toEqual({ t: 'error', code: 'unsupported_version' });
    expect(out.close).toEqual({ to: 'a', code: CLOSE.unsupportedVersion });
  });

  it('answers anything but join before joining with not_joined', () => {
    const s = new RoomSession(room);
    s.connect('a');
    expect(only(s.receive('a', move([0, 0, 4]), 0), 'a', 'error')).toEqual({ t: 'error', code: 'not_joined' });
    expect(s.participant('a')).toBeNull();
  });
});

describe('RoomSession move', () => {
  it('accepts a valid move, stores the pose rounded to 2 decimals and tells the same channel', () => {
    const s = joined('a', 'b');
    const out = s.receive('a', move([0.123, 0, 3.456], 1.5708, 'walk'), 500);
    expect(only(out, 'b', 'peer_moved')).toEqual({ t: 'peer_moved', peerId: 'a', p: [0.12, 0, 3.46], r: 1.57, a: 'walk' });
    expect(to(out, 'a')).toEqual([]);
    expect(s.participant('a')).toMatchObject({ pose: { p: [0.12, 0, 3.46], r: 1.57, a: 'walk' }, lastMoveAt: 500 });
  });

  it('rejects a teleport or an out-of-bounds move with a correction to the last good pose', () => {
    const s = joined('a', 'b');
    s.receive('a', move([1, 0, 4], 0.5), 1000);
    for (const p of [[1, 0, -4], [99, 0, 4]]) {
      const out = s.receive('a', move(p), 1100);
      expect(only(out, 'a', 'correction')).toEqual({ t: 'correction', p: [1, 0, 4], r: 0.5 });
      expect(to(out, 'b')).toEqual([]);
    }
    expect(s.participant('a')?.pose.p).toEqual([1, 0, 4]);
  });

  it('silently drops moves beyond 10 per second', () => {
    const s = joined('a', 'b');
    const forwarded = Array.from({ length: 12 }, (_, i) => s.receive('a', move([0, 0, 4], 0, i % 2 ? 'idle' : 'walk'), 1000).send.length);
    expect(forwarded.filter(Boolean)).toHaveLength(10);
    expect(forwarded.slice(10)).toEqual([0, 0]);
  });
});

describe('RoomSession leave and bad input', () => {
  it('tells the channel when a participant leaves, and forgets them', () => {
    const s = joined('a', 'b');
    const out = s.leave('a');
    expect(only(out, 'b', 'peer_left')).toEqual({ t: 'peer_left', peerId: 'a' });
    expect(s.participant('a')).toBeNull();
    expect(s.joinedCount).toBe(1);
    expect(s.leave('a').send, 'leaving twice is a no-op').toEqual([]);
  });

  it('a socket that never joined leaves without telling anyone', () => {
    const s = joined('a');
    s.connect('b');
    expect(s.leave('b').send).toEqual([]);
  });

  it('answers malformed messages with bad_message and closes with 4008 on the 5th within 10 seconds', () => {
    const s = joined('a');
    for (const at of [0, 1000, 2000, 3000]) {
      const out = s.receive('a', '{nope', at);
      expect(only(out, 'a', 'error')).toEqual({ t: 'error', code: 'bad_message' });
      expect(out.close).toBeUndefined();
    }
    expect(s.receive('a', '{"t":"move"}', 9999).close).toEqual({ to: 'a', code: CLOSE.badMessages });
  });

  it('forgets bad messages older than 10 seconds', () => {
    const s = joined('a');
    for (const at of [0, 1000, 2000, 3000]) s.receive('a', '{nope', at);
    expect(s.receive('a', '{nope', 10_500).close).toBeUndefined();
  });

  it('closes with 1009 on a message over 2KB', () => {
    const s = joined('a');
    expect(s.receive('a', JSON.stringify({ t: 'chat', text: 'x'.repeat(2100) }), 0).close).toEqual({ to: 'a', code: CLOSE.tooLarge });
  });

  it('restores a participant after hibernation so newcomers see their last pose', () => {
    const before = joined('a');
    before.receive('a', move([1, 0, 4], 0.5), 1000);
    const after = new RoomSession(room);
    after.restore(before.participant('a')!);
    after.connect('b');
    const welcome = only(after.receive('b', join(2), 2000), 'b', 'welcome');
    expect(welcome.peers).toEqual([expect.objectContaining({ peerId: 'a', p: [1, 0, 4], r: 0.5, a: 'walk' })]);
  });
});
