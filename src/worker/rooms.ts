// Room rows in D1 (data-model.md "Room"). The password hash never leaves this module.
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import { createRoomRequest, deleteRoomRequest, fieldErrors, listRoomsQuery, updateRoomRequest } from '../core/api-schemas.ts';
import { createChatFilter, parseWordList } from '../core/chat-filter.ts';
import { roomIdSchema } from '../core/protocol.ts';
import { createRoomData, type RoomData } from '../core/room-data.ts';
import words from '../data/profanity-ko.txt';
import { verifyTurnstile } from './turnstile.ts';

type C = Context<{ Bindings: Env }>;
export const filter = createChatFilter(parseWordList(words));

export type Room = {
  id: string;
  title: string;
  description: string;
  themeId: RoomData['themeId'];
  roomData: RoomData;
  onlineCount: number;
  createdAt: number;
  updatedAt: number;
};
type Row = { id: string; title: string; description: string; room_data: string; theme_id: Room['themeId']; online_count: number; created_at: number; updated_at: number; deleted_at: number | null };

// 404 / 410 as the openapi Error shape (index.ts onError).
export async function requireRoom(db: D1Database, id: string): Promise<Room> {
  if (!roomIdSchema.safeParse(id).success) throw new HTTPException(404);
  const row = await db
    .prepare('SELECT id, title, description, room_data, theme_id, online_count, created_at, updated_at, deleted_at FROM rooms WHERE id = ?')
    .bind(id)
    .first<Row>();
  if (!row) throw new HTTPException(404);
  if (row.deleted_at !== null) throw new HTTPException(410);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    themeId: row.theme_id,
    roomData: JSON.parse(row.room_data) as RoomData,
    onlineCount: row.online_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const validation = (c: C, error?: z.ZodError) => {
  const fields = error ? fieldErrors(error) : {};
  return c.json(Object.keys(fields).length ? { code: 'validation', fields } : { code: 'validation' }, 400);
};

// T064, order from precedent 2026-11-08-create-room-check-order: the rate limit runs before this (index.ts), validation before
// siteverify so a 400 does not spend the single-use widget token.
export async function createRoom(c: C): Promise<Response> {
  const json: unknown = await c.req.json().catch(() => undefined);
  if (json === undefined) return validation(c);
  const parsed = createRoomRequest.safeParse(json);
  if (!parsed.success) return validation(c, parsed.error);
  const { title, description, themeId, password, turnstileToken } = parsed.data;
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, turnstileToken))) return c.json({ code: 'turnstile_failed' }, 403);

  // 64 symbols divide 256, so every byte maps without bias.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ID_CHARS[b % 64]).join('');
  const passwordHash = await c.env.ROOM.getByName(id).hashPassword(password); // research R5: the room's DO has the CPU budget
  const now = Date.now();
  const room: Room = { id, title: filter(title), description: filter(description), themeId, roomData: createRoomData(themeId), onlineCount: 0, createdAt: now, updatedAt: now };
  await c.env.DB.prepare(
    'INSERT INTO rooms (id, title, description, room_data, theme_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, room.title, room.description, JSON.stringify(room.roomData), themeId, passwordHash, now, now)
    .run();
  return c.json(room, 201);
}
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

// T082: PATCH and DELETE share this. The RL_PASSWORD limit runs before it (index.ts); the hash goes to the room's DO to compare,
// like the create's hash (precedent 2026-11-06-password-hash-in-do), and nowhere else.
async function owned<T extends { password: string }>(c: C, schema: z.ZodType<T>): Promise<{ room: Room; body: T } | Response> {
  const json: unknown = await c.req.json().catch(() => undefined);
  if (json === undefined) return validation(c);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return validation(c, parsed.error);
  const room = await requireRoom(c.env.DB, c.req.param('roomId')!);
  const { hash } = (await c.env.DB.prepare('SELECT password_hash AS hash FROM rooms WHERE id = ?').bind(room.id).first<{ hash: string }>())!;
  if (!(await c.env.ROOM.getByName(room.id).verifyPassword(parsed.data.password, hash))) return c.json({ code: 'wrong_password' }, 403);
  return { room, body: parsed.data };
}

// A new theme brings its default objects (openapi PATCH); the same theme keeps the room's objects.
export async function updateRoom(c: C): Promise<Response> {
  const found = await owned(c, updateRoomRequest);
  if (found instanceof Response) return found;
  const { room: old, body } = found;
  const respawn = body.themeId !== undefined && body.themeId !== old.themeId;
  const themeId = body.themeId ?? old.themeId;
  const room: Room = {
    ...old,
    title: body.title === undefined ? old.title : filter(body.title),
    description: body.description === undefined ? old.description : filter(body.description),
    themeId,
    roomData: respawn ? createRoomData(themeId) : old.roomData,
    updatedAt: Date.now(),
  };
  await c.env.DB.prepare('UPDATE rooms SET title = ?, description = ?, theme_id = ?, room_data = ?, updated_at = ? WHERE id = ?')
    .bind(room.title, room.description, themeId, JSON.stringify(room.roomData), room.updatedAt, room.id)
    .run();
  const { id, title, description, roomData } = room;
  await c.env.ROOM.getByName(id).roomUpdated({ id, title, description, roomData }, respawn);
  return c.json(room);
}

export async function deleteRoom(c: C): Promise<Response> {
  const found = await owned(c, deleteRoomRequest);
  if (found instanceof Response) return found;
  await c.env.DB.prepare("UPDATE rooms SET deleted_at = ?, deleted_by = 'owner' WHERE id = ?").bind(Date.now(), found.room.id).run();
  await c.env.ROOM.getByName(found.room.id).roomDeleted('owner');
  return c.body(null, 204);
}

// FR-001: newest first, keyset pages on (created_at, id) so equal timestamps neither repeat nor drop.
export async function listRooms(c: C): Promise<Response> {
  const parsed = listRoomsQuery.safeParse(c.req.query());
  if (!parsed.success) return validation(c);
  const { limit, cursor } = parsed.data;
  const [at, after] = cursor ? cursor.split('.') : [Number.MAX_SAFE_INTEGER, ''];
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, theme_id, online_count, created_at FROM rooms
     WHERE deleted_at IS NULL AND (created_at < ?1 OR (created_at = ?1 AND id < ?2))
     ORDER BY created_at DESC, id DESC LIMIT ?3`,
  )
    .bind(Number(at), after, limit + 1)
    .all<Pick<Row, 'id' | 'title' | 'theme_id' | 'online_count' | 'created_at'>>();
  const items = results.slice(0, limit).map((r) => ({ id: r.id, title: r.title, themeId: r.theme_id, onlineCount: r.online_count, createdAt: r.created_at }));
  const last = items.at(-1);
  return c.json({ items, nextCursor: results.length > limit && last ? `${last.createdAt}.${last.id}` : null });
}
