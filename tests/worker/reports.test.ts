import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { signChat } from '../../src/worker/chat-sign.ts';
import { app } from '../../src/worker/index.ts';
import { deviceKey, insertRoom } from './rooms-helpers.ts';

// T086: POST /api/reports (contracts/openapi.yaml, data-model.md reports, quickstart Q12, Q15).
let ipSeq = 0;
const nextIp = () => `203.0.113.${++ipSeq}`;
const post = (body: unknown, ip = nextIp()) =>
  app.request(
    '/api/reports',
    { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) },
    env,
  );
const roomReport = (roomId: string, n = 1) => ({ target: { type: 'room', roomId }, reason: 'spam', deviceKey: deviceKey(n) });

async function signedMessage(roomId: string, sentAt = Date.now()) {
  const fields = { messageId: `m_${sentAt.toString(36)}.1`, nickname: '느긋한 수달', text: '나쁜 말', sentAt, channel: 1 };
  return { ...fields, sig: await signChat(env.SERVER_SECRET, roomId, fields) };
}
const messageReport = (roomId: string, message: unknown, n = 1) => ({ target: { type: 'message', roomId, message }, reason: 'abuse', deviceKey: deviceKey(n) });

const rows = (roomId: string) =>
  env.DB.prepare('SELECT * FROM reports WHERE room_id = ? ORDER BY id').bind(roomId).all<Record<string, unknown>>().then((r) => r.results);

async function hmacHex(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SERVER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('POST /api/reports', () => {
  it('room report 201, the same device again 200 duplicate, another device 201', async () => {
    const roomId = await insertRoom();
    const first = await post(roomReport(roomId));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ duplicate: false });
    const again = await post(roomReport(roomId));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ duplicate: true });
    expect((await post(roomReport(roomId, 2))).status).toBe(201);
    expect(await rows(roomId)).toHaveLength(2);
  });

  it('stores HMAC-SHA256(SERVER_SECRET, "reporter|" + key) hex, and the key itself nowhere in D1', async () => {
    const roomId = await insertRoom();
    await post(roomReport(roomId, 7));
    const [row] = await rows(roomId);
    expect(row).toMatchObject({ target_type: 'room', message_id: '', message_snapshot: null, reason: 'spam', status: 'open', resolved_at: null });
    expect(row!.reporter_hash).toBe(await hmacHex(`reporter|${deviceKey(7)}`));
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'").all<{ name: string }>();
    for (const { name } of results) {
      const dump = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results);
      expect(dump).not.toContain(deviceKey(7));
    }
  });

  it('message report with a valid signature 201 and keeps the snapshot (no sig, no device key)', async () => {
    const roomId = await insertRoom();
    const message = await signedMessage(roomId);
    expect((await post(messageReport(roomId, message))).status).toBe(201);
    const [row] = await rows(roomId);
    expect(row).toMatchObject({ target_type: 'message', message_id: message.messageId });
    const { nickname, text, sentAt, channel } = message;
    expect(JSON.parse(row!.message_snapshot as string)).toEqual({ nickname, text, sentAt, channel });
    expect((await post(messageReport(roomId, message))).status).toBe(200); // the same device, the same message
  });

  it('a room report and a message report from one device are different targets', async () => {
    const roomId = await insertRoom();
    expect((await post(roomReport(roomId))).status).toBe(201);
    expect((await post(messageReport(roomId, await signedMessage(roomId)))).status).toBe(201);
  });

  it('400 when the text was changed, without the expired key', async () => {
    const roomId = await insertRoom();
    const res = await post(messageReport(roomId, { ...(await signedMessage(roomId)), text: '바꾼 말' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation' });
    expect(await rows(roomId)).toHaveLength(0);
  });

  it('400 report.expired when sentAt is over 24 hours ago and the signature holds', async () => {
    const roomId = await insertRoom();
    const res = await post(messageReport(roomId, await signedMessage(roomId, Date.now() - 24 * 3600_000 - 1000)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation', fields: { message: 'report.expired' } });
  });

  it('a tampered old message is a plain 400, not expired', async () => {
    const roomId = await insertRoom();
    const old = await signedMessage(roomId, Date.now() - 25 * 3600_000);
    const res = await post(messageReport(roomId, { ...old, text: '바꾼 말' }));
    expect(await res.json()).toEqual({ code: 'validation' });
  });

  it('a message signed for another room is 400', async () => {
    const roomId = await insertRoom();
    const other = await insertRoom();
    expect((await post(messageReport(roomId, await signedMessage(other)))).status).toBe(400);
  });

  it('400 on a bad body', async () => {
    const roomId = await insertRoom();
    expect((await post('not json')).status).toBe(400);
    expect((await post({ ...roomReport(roomId), reason: 'boring' })).status).toBe(400);
    expect((await post({ ...roomReport(roomId), deviceKey: 'not-a-uuid' })).status).toBe(400);
  });

  it('404 for an unknown room, 410 for a deleted one', async () => {
    expect((await post(roomReport('nosuchroom'))).status).toBe(404);
    const gone = await insertRoom({ deletedAt: 5000 });
    const res = await post(roomReport(gone));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ code: 'gone' });
  });

  it('429 on the 11th request from one client within 60 s', async () => {
    const roomId = await insertRoom();
    const ip = nextIp();
    for (let n = 1; n <= 10; n++) expect((await post(roomReport(roomId, n), ip)).status).toBe(201);
    const res = await post(roomReport(roomId, 11), ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});
