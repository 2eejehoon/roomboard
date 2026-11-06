// WebSocket messages (contracts/websocket.md). These schemas are the source of truth; the doc's examples are tested against them.
import { z } from 'zod';
import { THEME_IDS } from './themes.ts';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 2048;

export const CLOSE = {
  normal: 1000,
  binary: 1003,
  tooLarge: 1009,
  joinTimeout: 4000,
  roomDeleted: 4001,
  unsupportedVersion: 4002,
  badMessages: 4008,
} as const;

export const roomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10}$/);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const anim = z.enum(['idle', 'walk', 'run', 'jump']);
const nonce = z.string().max(32);
const channel = z.int().min(1);

export const roomDataSchema = z.object({
  version: z.literal(1),
  themeId: z.enum(THEME_IDS),
  objects: z.array(
    z.object({
      id: z.string(),
      assetId: z.string(),
      position: vec3,
      rotationY: z.number(),
      scale: z.number().optional(),
      collider: z.enum(['box', 'none']),
    }),
  ),
});
const room = z.object({ id: roomIdSchema, title: z.string(), description: z.string(), roomData: roomDataSchema });
const identity = { peerId: z.string(), nickname: z.string(), avatarId: z.string() };
const pose = { p: vec3, r: z.number(), a: anim };

export const clientMessageSchema = z.discriminatedUnion('t', [
  // v is any integer so an old client gets unsupported_version instead of bad_message.
  z.object({ t: z.literal('join'), v: z.int(), deviceKey: z.uuid() }),
  z.object({ t: z.literal('move'), ...pose }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(200), nonce: nonce.optional() }),
]);

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    v: z.literal(PROTOCOL_VERSION),
    you: z.object(identity),
    channel,
    room,
    peers: z.array(z.object({ ...identity, ...pose })).max(19),
    spawn: vec3,
  }),
  z.object({ t: z.literal('peer_joined'), peer: z.object({ ...identity, ...pose }) }),
  z.object({ t: z.literal('peer_left'), peerId: z.string() }),
  z.object({ t: z.literal('peer_moved'), peerId: z.string(), ...pose }),
  z.object({ t: z.literal('correction'), p: vec3, r: z.number() }),
  z.object({
    t: z.literal('chat'),
    messageId: z.string(),
    peerId: z.string(),
    nickname: z.string(),
    text: z.string(),
    sentAt: z.int(),
    channel,
    sig: z.string(),
    nonce: nonce.optional(),
  }),
  z.object({ t: z.literal('rate_limited'), scope: z.literal('chat'), retryAfterMs: z.int().min(0), nonce: nonce.optional() }),
  z.object({ t: z.literal('room_updated'), room }),
  z.object({ t: z.literal('room_deleted'), by: z.enum(['owner', 'admin']) }),
  z.object({ t: z.literal('error'), code: z.enum(['bad_message', 'unsupported_version', 'not_joined']) }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ParseResult = { ok: true; msg: ClientMessage } | { ok: false; reason: 'too_large' | 'bad_message' };

// UTF-8 length without TextEncoder, which core cannot use (tsconfig.core.json).
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function parseClientMessage(raw: string): ParseResult {
  if (utf8Length(raw) > MAX_MESSAGE_BYTES) return { ok: false, reason: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'bad_message' };
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? { ok: true, msg: parsed.data } : { ok: false, reason: 'bad_message' };
}
