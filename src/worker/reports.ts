// T089: POST /api/reports (contracts/openapi.yaml, data-model.md reports). The RL_REPORT limit runs before this (index.ts).
import type { Context } from 'hono';
import { createReportRequest } from '../core/api-schemas.ts';
import { verifyChat } from './chat-sign.ts';
import { requireRoom } from './rooms.ts';

type C = Context<{ Bindings: Env }>;
const SIG_TTL_MS = 24 * 3600_000; // research R14

// data-model.md: keyed with SERVER_SECRET, so the stored hash cannot be matched to a device key without it.
async function reporterHash(secret: string, deviceKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`reporter|${deviceKey}`)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createReport(c: C): Promise<Response> {
  const parsed = createReportRequest.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ code: 'validation' }, 400);
  const { target, reason, deviceKey } = parsed.data;
  await requireRoom(c.env.DB, target.roomId);

  let messageId = '';
  let snapshot: string | null = null;
  if (target.type === 'message') {
    const { sig, ...fields } = target.message;
    if (!(await verifyChat(c.env.SERVER_SECRET, target.roomId, fields, sig))) return c.json({ code: 'validation' }, 400);
    // After the signature: sentAt is signed, so only a real old message reads as expired (precedent 2026-11-09-report-list-per-target).
    if (Date.now() - fields.sentAt > SIG_TTL_MS) return c.json({ code: 'validation', fields: { message: 'report.expired' } }, 400);
    messageId = fields.messageId;
    snapshot = JSON.stringify({ nickname: fields.nickname, text: fields.text, sentAt: fields.sentAt, channel: fields.channel });
  }

  // The UNIQUE target + reporter key decides duplicates, never the sig (several strings verify for one message, T086 memo).
  const { meta } = await c.env.DB.prepare(
    `INSERT INTO reports (target_type, room_id, message_id, message_snapshot, reason, reporter_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )
    .bind(target.type, target.roomId, messageId, snapshot, reason, await reporterHash(c.env.SERVER_SECRET, deviceKey), Date.now())
    .run();
  const duplicate = meta.changes === 0;
  return c.json({ duplicate }, duplicate ? 200 : 201);
}
