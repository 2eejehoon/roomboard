import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../../src/core/protocol.ts';
import { verifyChat } from '../../src/worker/chat-sign.ts';
import { insertRoom, joinRoom } from './rooms-helpers.ts';

type Chat = Extract<ServerMessage, { t: 'chat' }>;

// websocket.md `chat.sig`, computed here without the code under test.
async function expectedSig(roomId: string, c: Chat) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SERVER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = ['chat', roomId, c.messageId, c.nickname, c.text, c.sentAt, c.channel].join('|');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...mac)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function receivedChat(text: string) {
  const roomId = await insertRoom();
  const a = await joinRoom(roomId, 1);
  const b = await joinRoom(roomId, 2);
  await a.next(); // peer_joined
  a.send({ t: 'chat', text });
  const msg = await b.next();
  if (msg.t !== 'chat') throw new Error(`expected chat, got ${msg.t}`);
  return { roomId, msg };
}

describe('chat signature (research R14)', () => {
  it('the DO signs each chat with HMAC-SHA256(SERVER_SECRET) over the websocket.md fields, base64url without padding', async () => {
    const { roomId, msg } = await receivedChat('안녕하세요');
    expect(msg.sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(msg.sig).toBe(await expectedSig(roomId, msg));
    expect(await verifyChat(env.SERVER_SECRET, roomId, msg, msg.sig)).toBe(true);
  });

  it('fails when any field, the room or the secret changes', async () => {
    const { roomId, msg } = await receivedChat('안녕하세요');
    const changed = [{ messageId: 'm_other' }, { nickname: '다른 사람' }, { text: '안녕하세요!' }, { sentAt: msg.sentAt + 1 }, { channel: msg.channel + 1 }];
    for (const patch of changed) expect(await verifyChat(env.SERVER_SECRET, roomId, { ...msg, ...patch }, msg.sig), JSON.stringify(patch)).toBe(false);
    expect(await verifyChat(env.SERVER_SECRET, 'otherroom1', msg, msg.sig)).toBe(false);
    expect(await verifyChat('wrong-secret', roomId, msg, msg.sig)).toBe(false);
    expect(await verifyChat(env.SERVER_SECRET, roomId, msg, msg.sig.slice(1))).toBe(false);
  });

  it('fails when text is shifted into the nickname across a "|", although the signed string is the same', async () => {
    const { roomId, msg } = await receivedChat('앞|뒤');
    const shifted = { ...msg, nickname: `${msg.nickname}|앞`, text: '뒤' };
    expect(await expectedSig(roomId, shifted)).toBe(msg.sig);
    expect(await verifyChat(env.SERVER_SECRET, roomId, shifted, msg.sig)).toBe(false);
  });

  // PR #26 review: a report arrives as JSON, where sentAt and channel can be strings that hold a "|".
  it('fails when the end of the text is shifted into a string sentAt, although the signed string is the same', async () => {
    const { roomId, msg } = await receivedChat('앞|1');
    const shifted = { ...msg, text: '앞', sentAt: `1|${msg.sentAt}` as unknown as number };
    expect(await expectedSig(roomId, shifted)).toBe(msg.sig);
    expect(await verifyChat(env.SERVER_SECRET, roomId, shifted, msg.sig)).toBe(false);
    expect(await verifyChat(env.SERVER_SECRET, roomId, { ...msg, channel: String(msg.channel) as unknown as number }, msg.sig)).toBe(false);
  });
});
