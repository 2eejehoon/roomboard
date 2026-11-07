// Room rows in D1 (data-model.md "Room"). The password hash never leaves this module.
import { HTTPException } from 'hono/http-exception';
import { roomIdSchema } from '../core/protocol.ts';
import type { RoomData } from '../core/room-data.ts';

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
