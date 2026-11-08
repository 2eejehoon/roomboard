import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { insertRoom } from './rooms-helpers.ts';

// T059: GET /api/rooms, newest first (FR-001). Each test inserts above any earlier row and reads the top, whether or not rows outlive tests.
type Page = { items: { id: string; title: string; themeId: string; onlineCount: number; createdAt: number }[]; nextCursor: string | null };
const list = async (query = '') => {
  const res = await exports.default.fetch(`https://roomboard.test/api/rooms${query}`);
  return { status: res.status, body: await res.json<Page & { code?: string }>() };
};
let top = 9_000_000_000_000;
const above = () => (top += 1000);

describe('GET /api/rooms', () => {
  it('newest first, deleted rooms left out, RoomSummary fields with onlineCount', async () => {
    const t = above();
    const older = await insertRoom({ createdAt: t + 1, title: '먼저' });
    await insertRoom({ createdAt: t + 2, deletedAt: t + 5 });
    const newer = await insertRoom({ createdAt: t + 3, title: '나중', onlineCount: 4 });
    const { status, body } = await list('?limit=2');
    expect(status).toBe(200);
    expect(body.items).toEqual([
      { id: newer, title: '나중', themeId: 'cafe', onlineCount: 4, createdAt: t + 3 },
      { id: older, title: '먼저', themeId: 'cafe', onlineCount: 0, createdAt: t + 1 },
    ]);
  });

  it('limit defaults to 20 and allows up to 50', async () => {
    const t = above();
    const ids = new Set<string>();
    for (let i = 0; i < 21; i++) ids.add(await insertRoom({ createdAt: t + i }));
    const first = await list();
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items.every((r) => ids.has(r.id))).toBe(true);
    expect((await list('?limit=50')).body.items.length).toBeGreaterThanOrEqual(21);
  });

  it.each(['?limit=0', '?limit=51', '?limit=abc', '?cursor=nonsense', '?cursor=12.bad*id'])('400 validation for %s', async (q) => {
    expect(await list(q)).toEqual({ status: 400, body: { code: 'validation' } });
  });

  it('nextCursor walks pages without skipping or repeating rooms that share a timestamp', async () => {
    const t = above();
    const ids = [await insertRoom({ createdAt: t }), await insertRoom({ createdAt: t }), await insertRoom({ createdAt: t })];
    const first = await list('?limit=2');
    const second = await list(`?limit=2&cursor=${encodeURIComponent(first.body.nextCursor!)}`);
    const seen = [...first.body.items, second.body.items[0]!].map((r) => r.id);
    expect(seen.sort()).toEqual(ids.sort());
  });

  it('the last page has nextCursor null', async () => {
    let cursor: string | null = '';
    let pages = 0;
    while (cursor !== null && pages++ < 100) cursor = (await list(`?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).body.nextCursor;
    expect(cursor).toBeNull();
  });
});
