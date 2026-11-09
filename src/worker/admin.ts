// T090: /api/admin/* (contracts/openapi.yaml, precedents 2026-11-06-admin-token, 2026-11-09-report-list-per-target).
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { tooMany } from './rate-limit.ts';
import { requireRoom } from './rooms.ts';

type AppEnv = { Bindings: Env };
type C = Context<AppEnv>;
const PAGE = 50;

// Digests first: timingSafeEqual needs equal lengths, and comparing lengths would leak the token's.
async function sameToken(a: string, b: string): Promise<boolean> {
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return crypto.subtle.timingSafeEqual(await digest(a), await digest(b));
}

// Only failures count against RL_ADMIN (FR-042), keyed by the client IP for this request only (research R9).
export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const given = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1];
  if (c.env.ADMIN_TOKEN && given && (await sameToken(c.env.ADMIN_TOKEN, given))) return next();
  const { success } = await c.env.RL_ADMIN.limit({ key: c.req.header('cf-connecting-ip') ?? 'unknown' });
  if (!success) return tooMany(c, 60_000);
  c.header('WWW-Authenticate', 'Bearer');
  return c.json({ code: 'unauthorized' }, 401);
};

const listQuery = z.object({ status: z.enum(['open', 'resolved']).default('open'), cursor: z.string().regex(/^\d+$/).optional() });
type Row = {
  id: number;
  target_type: 'room' | 'message';
  room_id: string;
  message_id: string;
  message_snapshot: string | null;
  reason: string;
  status: string;
  created_at: number;
  room_title: string | null;
  report_count: number;
};
const SAME_TARGET = 'x.status = r.status AND x.target_type = r.target_type AND x.room_id = r.room_id AND x.message_id = r.message_id';

// One row per target: its newest report in that status stands for it, with the count of that target's reports in that status.
export async function listReports(c: C): Promise<Response> {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ code: 'validation' }, 400);
  const { status, cursor } = parsed.data;
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.target_type, r.room_id, r.message_id, r.message_snapshot, r.reason, r.status, r.created_at, rooms.title AS room_title,
       (SELECT COUNT(*) FROM reports x WHERE ${SAME_TARGET}) AS report_count
     FROM reports r LEFT JOIN rooms ON rooms.id = r.room_id
     WHERE r.status = ?1 AND r.id < ?2 AND NOT EXISTS (SELECT 1 FROM reports x WHERE ${SAME_TARGET} AND x.id > r.id)
     ORDER BY r.id DESC LIMIT ?3`,
  )
    .bind(status, cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER, PAGE + 1)
    .all<Row>();
  const items = results.slice(0, PAGE).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    roomId: r.room_id,
    roomTitle: r.room_title,
    messageId: r.target_type === 'message' ? r.message_id : null,
    messageSnapshot: r.message_snapshot === null ? null : (JSON.parse(r.message_snapshot) as unknown),
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    reportCount: r.report_count,
  }));
  return c.json({ items, nextCursor: results.length > PAGE ? String(items.at(-1)!.id) : null });
}

// Resolves every open report on the same target as this one (the list shows the target once). A report already resolved changes
// nothing, so a stale click cannot close newer reports on that target (PR #38 review). The row shown is the target's newest report,
// so `id <= ` it closes what the admin saw and leaves one that came in after the list loaded (PR #39 review).
export async function resolveReport(c: C): Promise<Response> {
  const id = c.req.param('reportId')!;
  const target = /^\d+$/.test(id)
    ? await c.env.DB.prepare('SELECT target_type, room_id, message_id, status FROM reports WHERE id = ?')
        .bind(Number(id))
        .first<Pick<Row, 'target_type' | 'room_id' | 'message_id' | 'status'>>()
    : null;
  if (!target) return c.json({ code: 'not_found' }, 404);
  if (target.status !== 'open') return c.body(null, 204);
  await c.env.DB.prepare(
    "UPDATE reports SET status = 'resolved', resolved_at = ? WHERE status = 'open' AND target_type = ? AND room_id = ? AND message_id = ? AND id <= ?",
  )
    .bind(Date.now(), target.target_type, target.room_id, target.message_id, Number(id))
    .run();
  return c.body(null, 204);
}

// data-model.md: the room's open reports, room and message alike, resolve with it. A room the owner deleted first still answers
// 410, but its open reports resolve too, or the admin list would keep a row nothing can clear (PR #39 review). The UPDATE itself
// decides "already deleted", so an owner delete landing after the 404 check is neither overwritten nor announced twice.
export async function adminDeleteRoom(c: C): Promise<Response> {
  const id = c.req.param('roomId')!;
  await requireRoom(c.env.DB, id).catch((e: unknown) => {
    if (!(e instanceof HTTPException && e.status === 410)) throw e;
  });
  const now = Date.now();
  const [room] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE rooms SET deleted_at = ?, deleted_by = 'admin' WHERE id = ? AND deleted_at IS NULL").bind(now, id),
    c.env.DB.prepare("UPDATE reports SET status = 'resolved', resolved_at = ? WHERE room_id = ? AND status = 'open'").bind(now, id),
  ]);
  if (room!.meta.changes === 0) return c.json({ code: 'gone' }, 410);
  await c.env.ROOM.getByName(id).roomDeleted('admin');
  return c.body(null, 204);
}
