// Chat signatures (research R14, websocket.md `chat.sig`): the DO signs every chat it sends; a report brings the chat back
// with its signature and the Worker verifies it, so the server never stores chat.
import type { ChatFields } from '../core/room-session.ts';

const enc = new TextEncoder();
const key = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const payload = (roomId: string, c: ChatFields) => enc.encode(['chat', roomId, c.messageId, c.nickname, c.text, c.sentAt, c.channel].join('|'));

export async function signChat(secret: string, roomId: string, c: ChatFields): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), payload(roomId, c)));
  return btoa(String.fromCharCode(...mac)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function verifyChat(secret: string, roomId: string, c: ChatFields, sig: string): Promise<boolean> {
  // Fields are joined with "|": one in a field before the text would let a reporter shift text into it under the same signature.
  if ([roomId, c.messageId, c.nickname].some((f) => f.includes('|')) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  const mac = Uint8Array.from(atob(sig.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0));
  return crypto.subtle.verify('HMAC', await key(secret), mac, payload(roomId, c));
}
