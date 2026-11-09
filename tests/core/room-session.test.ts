import { describe, expect, it } from 'vitest';
import { avatarFor, nicknameFor } from '../../src/core/identity.ts';
import { createChatFilter } from '../../src/core/chat-filter.ts';
import { CLOSE, type ServerMessage } from '../../src/core/protocol.ts';
import { createRoomData } from '../../src/core/room-data.ts';
import { RoomSession, type ChatFields, type Outbox } from '../../src/core/room-session.ts';
import { CHANNEL_CAPACITY } from '../../src/core/channels.ts';
import { THEMES } from '../../src/core/themes.ts';

const room = { id: 'seedroom01', title: '시드 방', description: '', roomData: createRoomData('cafe') };
const spawn = THEMES.cafe.spawn;
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const join = (n = 1) => JSON.stringify({ t: 'join', v: 1, deviceKey: key(n) });
const move = (p: number[], r = 0, a = 'walk') => JSON.stringify({ t: 'move', p, r, a });
const chat = (text: string, nonce?: string) => JSON.stringify({ t: 'chat', text, nonce });
const to = (out: Outbox, peerId: string) => out.send.filter((s) => s.to === peerId).map((s) => s.msg);
const only = <T extends ServerMessage['t']>(out: Outbox, peerId: string, t: T) => {
  const msgs = to(out, peerId);
  expect(msgs.map((m) => m.t)).toEqual([t]);
  return msgs[0] as Extract<ServerMessage, { t: T }>;
};

// The DO injects the real word list and an HMAC signer (T072); here a one-word list and a readable fake signature.
const fakeSig = (c: ChatFields) => ['sig', c.messageId, c.nickname, c.text, c.sentAt, c.channel].join('/');
const deps = { filter: createChatFilter(['바보']), sign: async (c: ChatFields) => fakeSig(c) };
const session = () => new RoomSession(room, deps);

async function joined(...peers: string[]) {
  const s = session();
  for (const [i, id] of peers.entries()) {
    s.connect(id);
    await s.receive(id, join(i + 1), 0);
  }
  return s;
}

describe('RoomSession join', () => {
  it('welcomes the joiner with identity from the device key, spawn and same-channel peers; tells the others', async () => {
    const s = await joined('a');
    s.connect('b');
    const out = await s.receive('b', join(2), 100);
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

  it('puts the 21st participant in channel 2, who sees and is seen by nobody in channel 1', async () => {
    const ids = Array.from({ length: CHANNEL_CAPACITY }, (_, i) => `p${i}`);
    const s = await joined(...ids);
    s.connect('late');
    const out = await s.receive('late', join(99), 0);
    const welcome = only(out, 'late', 'welcome');
    expect(welcome.channel).toBe(2);
    expect(welcome.peers).toEqual([]);
    expect(out.send).toHaveLength(1);
    expect(s.participant('late')?.channel).toBe(2);
  });

  it('answers a second join with bad_message', async () => {
    const s = await joined('a');
    expect(only(await s.receive('a', join(1), 10), 'a', 'error')).toEqual({ t: 'error', code: 'bad_message' });
  });

  it('closes with 4002 on an unsupported protocol version', async () => {
    const s = session();
    s.connect('a');
    const out = await s.receive('a', JSON.stringify({ t: 'join', v: 2, deviceKey: key(1) }), 0);
    expect(only(out, 'a', 'error')).toEqual({ t: 'error', code: 'unsupported_version' });
    expect(out.close).toEqual({ to: 'a', code: CLOSE.unsupportedVersion });
  });

  it('answers anything but join before joining with not_joined', async () => {
    const s = session();
    s.connect('a');
    expect(only(await s.receive('a', move([0, 0, 4]), 0), 'a', 'error')).toEqual({ t: 'error', code: 'not_joined' });
    expect(s.participant('a')).toBeNull();
  });
});

describe('RoomSession move', () => {
  it('accepts a valid move, stores the pose rounded to 2 decimals and tells the same channel', async () => {
    const s = await joined('a', 'b');
    const out = await s.receive('a', move([0.123, 0, 3.456], 1.5708, 'walk'), 500);
    expect(only(out, 'b', 'peer_moved')).toEqual({ t: 'peer_moved', peerId: 'a', p: [0.12, 0, 3.46], r: 1.57, a: 'walk' });
    expect(to(out, 'a')).toEqual([]);
    expect(s.participant('a')).toMatchObject({ pose: { p: [0.12, 0, 3.46], r: 1.57, a: 'walk' }, lastMoveAt: 500 });
  });

  it('rejects a teleport or an out-of-bounds move with a correction to the last good pose', async () => {
    const s = await joined('a', 'b');
    await s.receive('a', move([1, 0, 4], 0.5), 1000);
    for (const p of [[1, 0, -4], [99, 0, 4]]) {
      const out = await s.receive('a', move(p), 1100);
      expect(only(out, 'a', 'correction')).toEqual({ t: 'correction', p: [1, 0, 4], r: 0.5 });
      expect(to(out, 'b')).toEqual([]);
    }
    expect(s.participant('a')?.pose.p).toEqual([1, 0, 4]);
  });

  it('silently drops moves beyond 10 per second', async () => {
    const s = await joined('a', 'b');
    const forwarded: number[] = [];
    for (let i = 0; i < 12; i++) forwarded.push((await s.receive('a', move([0, 0, 4], 0, i % 2 ? 'idle' : 'walk'), 1000)).send.length);
    expect(forwarded.filter(Boolean)).toHaveLength(10);
    expect(forwarded.slice(10)).toEqual([0, 0]);
  });
});

describe('RoomSession leave and bad input', () => {
  it('tells the channel when a participant leaves, and forgets them', async () => {
    const s = await joined('a', 'b');
    const out = s.leave('a');
    expect(only(out, 'b', 'peer_left')).toEqual({ t: 'peer_left', peerId: 'a' });
    expect(s.participant('a')).toBeNull();
    expect(s.joinedCount).toBe(1);
    expect(s.leave('a').send, 'leaving twice is a no-op').toEqual([]);
  });

  it('a socket that never joined leaves without telling anyone', async () => {
    const s = await joined('a');
    s.connect('b');
    expect(s.leave('b').send).toEqual([]);
  });

  it('answers malformed messages with bad_message and closes with 4008 on the 5th within 10 seconds', async () => {
    const s = await joined('a');
    for (const at of [0, 1000, 2000, 3000]) {
      const out = await s.receive('a', '{nope', at);
      expect(only(out, 'a', 'error')).toEqual({ t: 'error', code: 'bad_message' });
      expect(out.close).toBeUndefined();
    }
    expect((await s.receive('a', '{"t":"move"}', 9999)).close).toEqual({ to: 'a', code: CLOSE.badMessages });
  });

  it('forgets bad messages older than 10 seconds', async () => {
    const s = await joined('a');
    for (const at of [0, 1000, 2000, 3000]) await s.receive('a', '{nope', at);
    expect((await s.receive('a', '{nope', 10_500)).close).toBeUndefined();
  });

  it('closes with 1009 on a message over 2KB', async () => {
    const s = await joined('a');
    expect((await s.receive('a', JSON.stringify({ t: 'chat', text: 'x'.repeat(2100) }), 0)).close).toEqual({ to: 'a', code: CLOSE.tooLarge });
  });

  it('restores a participant after hibernation so newcomers see their last pose', async () => {
    const before = await joined('a');
    await before.receive('a', move([1, 0, 4], 0.5), 1000);
    const after = session();
    after.restore(before.participant('a')!);
    after.connect('b');
    const welcome = only(await after.receive('b', join(2), 2000), 'b', 'welcome');
    expect(welcome.peers).toEqual([expect.objectContaining({ peerId: 'a', p: [1, 0, 4], r: 0.5, a: 'walk' })]);
  });
});

describe('RoomSession chat', () => {
  it('filters, then sends to everyone in the channel with the server time and channel; only the sender copy has the nonce', async () => {
    const s = await joined('a', 'b');
    const out = await s.receive('a', chat('  안녕 바보  ', 'c-1'), 5000);
    const theirs = only(out, 'b', 'chat');
    expect(theirs).toEqual({
      t: 'chat',
      messageId: expect.stringMatching(/^m_/),
      peerId: 'a',
      nickname: nicknameFor(key(1)),
      text: '안녕 **',
      sentAt: 5000,
      channel: 1,
      sig: fakeSig(theirs),
    });
    expect(only(out, 'a', 'chat')).toEqual({ ...theirs, nonce: 'c-1' });
    expect(out.close).toBeUndefined();
  });

  it('gives every message its own id, also after hibernation restores the sender', async () => {
    const before = await joined('a', 'b');
    const ids = [];
    for (const at of [1000, 1000]) ids.push(only(await before.receive('a', chat('hi'), at), 'b', 'chat').messageId);
    const after = session();
    after.restore(before.participant('a')!);
    after.restore(before.participant('b')!);
    ids.push(only(await after.receive('a', chat('hi'), 20_000), 'b', 'chat').messageId);
    expect(new Set(ids).size).toBe(3);
  });

  it('does not reach another channel', async () => {
    const ids = Array.from({ length: CHANNEL_CAPACITY }, (_, i) => `p${i}`);
    const s = await joined(...ids);
    s.connect('late');
    await s.receive('late', join(99), 0);
    expect((await s.receive('late', chat('hi'), 100)).send.map((m) => m.to)).toEqual(['late']);
    expect((await s.receive('p0', chat('hi'), 100)).send.map((m) => m.to)).not.toContain('late');
  });

  it('beyond 5 in 10 seconds drops the message and tells only the sender, with the nonce; moves keep their own bucket', async () => {
    const s = await joined('a', 'b');
    for (let i = 1; i <= 5; i++) expect(to(await s.receive('a', chat(`m${i}`, `c-${i}`), 0), 'b')).toHaveLength(1);
    const out = await s.receive('a', chat('m6', 'c-6'), 0);
    expect(out.send).toEqual([{ to: 'a', msg: { t: 'rate_limited', scope: 'chat', retryAfterMs: 2000, nonce: 'c-6' } }]);
    expect(only(await s.receive('a', move([0, 0, 4]), 100), 'b', 'peer_moved')).toBeTruthy();
    expect(only(await s.receive('a', chat('m7'), 2000), 'b', 'chat').text).toBe('m7');
  });

  it('rejects a blank or 201-character message as bad_message without sending it (it counts toward 4008)', async () => {
    const s = await joined('a', 'b');
    for (const text of ['   ', 'x'.repeat(201)]) {
      const out = await s.receive('a', chat(text), 0);
      expect(out.send).toEqual([{ to: 'a', msg: { t: 'error', code: 'bad_message' } }]);
    }
    expect(only(await s.receive('a', chat('x'.repeat(200)), 0), 'b', 'chat').text).toHaveLength(200);
  });
});

// T079 / T083: the owner's edit reaches every channel, and later joiners get the new room.
describe('RoomSession update', () => {
  const edited = { ...room, title: '새 제목', roomData: createRoomData('library') };

  it('sends room_updated to everyone in every channel, and welcomes later joiners with the new room', async () => {
    const ids = Array.from({ length: CHANNEL_CAPACITY + 1 }, (_, i) => `p${i}`);
    const s = await joined(...ids);
    expect(s.participant(ids.at(-1)!)?.channel).toBe(2);
    const out = s.update(edited, true, 1000);
    for (const id of ids) expect(to(out, id)).toEqual([{ t: 'room_updated', room: edited }]);
    s.connect('late');
    expect(only(await s.receive('late', join(99), 1000), 'late', 'welcome').room).toEqual(edited);
  });

  it('a theme change puts everyone at the new spawn, so a move from there is not corrected', async () => {
    const s = await joined('a', 'b');
    await s.receive('a', move([1, 0, 4]), 1000);
    s.update(edited, true, 2000);
    expect(s.participant('a')?.pose).toEqual({ p: THEMES.library.spawn, r: 0, a: 'idle' });
    const out = await s.receive('a', move([0.5, 0, 6]), 2200);
    expect(only(out, 'b', 'peer_moved')).toMatchObject({ p: [0.5, 0, 6] });
  });

  it('without a theme change poses stay', async () => {
    const s = await joined('a');
    await s.receive('a', move([1, 0, 4]), 1000);
    s.update({ ...room, title: '새 제목' }, false, 2000);
    expect(s.participant('a')?.pose.p).toEqual([1, 0, 4]);
  });
});
