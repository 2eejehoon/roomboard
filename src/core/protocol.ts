// WebSocket messages (contracts/websocket.md). These schemas are the source of truth; the doc's examples are tested against them.
import { z } from 'zod';
import { THEME_IDS } from './themes.ts';

export const PROTOCOL_VERSION = 2;
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
const cell = z.tuple([z.int(), z.int(), z.int()]);
// A held direction [x, z] of length ≤ 1; the slack lets a normalized vector that rounds a hair over through.
const dir = z.tuple([z.number(), z.number()]).refine(([x, z]) => x * x + z * z <= 1 + 1e-9);
// 004 launch rounding (research R3): p to 2 decimals, v and s to 3.
const decimals = (n: number) => z.number().refine((x) => Number(x.toFixed(n)) === x);
export const launchSchema = z.object({
  t: z.int(),
  p: z.tuple([decimals(2), decimals(2), decimals(2)]),
  v: z.tuple([decimals(3), decimals(3), decimals(3)]),
  s: decimals(3),
  cause: z.enum(['hit', 'wall', 'air', 'recover', 'block']),
});
const blockKind = z.enum(['dirt', 'stone']);
const skill = z.enum(['jab', 'smash', 'throw']);
const height = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

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

const matchSchema = z.discriminatedUnion('state', [
  z.object({
    t: z.literal('match'),
    state: z.literal('running'),
    endsAt: z.int(),
    players: z.array(z.object({ peerId: z.string(), stocks: z.int().min(0) })),
    at: z.int(),
  }),
  z.object({ t: z.literal('match'), state: z.literal('ended'), ranks: z.array(z.object({ peerId: z.string(), rank: z.int().min(1) })), at: z.int() }),
  z.object({ t: z.literal('match'), state: z.literal('cancelled'), at: z.int() }),
]);

export const clientMessageSchema = z.discriminatedUnion('t', [
  // v is any integer so an old client gets unsupported_version instead of bad_message.
  z.object({ t: z.literal('join'), v: z.int(), deviceKey: z.uuid() }),
  z.object({ t: z.literal('move'), ...pose, d: dir.optional() }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(200), nonce: nonce.optional() }),
  // 004 (contracts/websocket.md v2)
  z.object({ t: z.literal('hold'), k: z.literal('smash') }),
  z.object({ t: z.literal('skill'), k: skill, nonce: nonce.optional() }),
  z.object({ t: z.literal('guard'), on: z.boolean() }),
  z.object({ t: z.literal('roll'), d: dir }),
  z.object({ t: z.literal('air'), k: z.enum(['jump', 'recover']) }),
  z.discriminatedUnion('op', [
    z.strictObject({ t: z.literal('block'), op: z.literal('place'), kind: blockKind, h: height }),
    z.strictObject({ t: z.literal('block'), op: z.literal('break'), h: height }),
  ]),
  z.object({ t: z.literal('match_start') }),
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
    arena: z.object({
      blocks: z.array(z.tuple([cell, blockKind.nullable(), z.int().min(0)])),
      fighters: z.array(z.object({ peerId: z.string(), damage: z.int().min(0), launch: launchSchema.nullable(), stocks: z.int().min(0).nullable() })),
      match: matchSchema.nullable(),
    }),
    at: z.int(),
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
  z.object({ t: z.literal('rate_limited'), scope: z.enum(['chat', 'block']), retryAfterMs: z.int().min(0), nonce: nonce.optional() }),
  z.object({ t: z.literal('room_updated'), room }),
  z.object({ t: z.literal('room_deleted'), by: z.enum(['owner', 'admin']) }),
  z.object({ t: z.literal('error'), code: z.enum(['bad_message', 'unsupported_version', 'not_joined']) }),
  // 004 (contracts/websocket.md v2)
  z.object({
    t: z.literal('swing'),
    peerId: z.string(),
    k: skill,
    step: z.int().min(1).optional(),
    nonce: nonce.optional(),
    at: z.int(),
    hitstopMs: z.int().min(0),
    readyAt: z.int(),
    hits: z.array(z.object({ peerId: z.string(), damage: z.int().min(0), guarded: z.boolean(), hitstopMs: z.int().min(0), launch: launchSchema })),
  }),
  z.object({
    t: z.literal('launch'),
    peerId: z.string(),
    at: z.int(),
    launch: launchSchema,
    wall: z.object({ result: z.enum(['bounce', 'break']), damage: z.number().min(0), cell }).optional(),
  }),
  z.object({ t: z.literal('landed'), peerId: z.string(), p: vec3, end: z.enum(['land', 'tech']), at: z.int() }),
  z.object({ t: z.literal('knocked_out'), peerId: z.string(), respawnAt: z.int(), stocks: z.int().min(0).nullable(), out: z.boolean(), at: z.int() }),
  z.object({ t: z.literal('respawned'), peerId: z.string(), p: vec3, at: z.int() }),
  z.object({ t: z.literal('block'), cell, kind: blockKind.nullable(), hp: z.int().min(0), at: z.int() }),
  z.object({ t: z.literal('arena_reset'), at: z.int() }),
  matchSchema,
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
    else if (c >= 0xd800 && c <= 0xdbff && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
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
