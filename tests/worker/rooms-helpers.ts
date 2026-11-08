// Test helpers for room rows and room WebSockets (not a test file).
import { env, exports } from 'cloudflare:workers';
import { createRoomData } from '../../src/core/room-data.ts';
import type { ServerMessage } from '../../src/core/protocol.ts';

let seq = 0;
// A fresh room per test: DO instances and D1 rows outlive a single test.
export async function insertRoom(opts: { deletedAt?: number; title?: string; description?: string } = {}): Promise<string> {
  const id = `room${String(++seq).padStart(2, '0')}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
  await env.DB.prepare(
    `INSERT INTO rooms (id, title, description, room_data, theme_id, password_hash, created_at, updated_at, deleted_at, deleted_by)
     VALUES (?, ?, ?, ?, 'cafe', 'x', 1000, 2000, ?, ?)`,
  )
    .bind(id, opts.title ?? '테스트 방', opts.description ?? '설명', JSON.stringify(createRoomData('cafe')), opts.deletedAt ?? null, opts.deletedAt ? 'owner' : null)
    .run();
  return id;
}

export const deviceKey = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export type Client = {
  ws: WebSocket;
  send(msg: unknown): void;
  next(): Promise<ServerMessage>;
  closed: Promise<number>;
};

export async function connect(roomId: string): Promise<Client> {
  const res = await exports.default.fetch(`https://roomboard.test/api/rooms/${roomId}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no upgrade: ${res.status}`);
  ws.accept();
  const queue: string[] = [];
  const waiters: ((s: string) => void)[] = [];
  ws.addEventListener('message', (e) => {
    const data = String(e.data);
    const w = waiters.shift();
    if (w) w(data);
    else queue.push(data);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener('close', (e) => resolve(e.code)));
  const raw = () => new Promise<string>((resolve) => (queue.length ? resolve(queue.shift()!) : waiters.push(resolve)));
  return {
    ws,
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
    next: async () => JSON.parse(await raw()) as ServerMessage,
    closed,
  };
}

export async function joinRoom(roomId: string, n: number) {
  const c = await connect(roomId);
  c.send({ t: 'join', v: 1, deviceKey: deviceKey(n) });
  const welcome = await c.next();
  if (welcome.t !== 'welcome') throw new Error(`expected welcome, got ${welcome.t}`);
  return { ...c, welcome };
}
