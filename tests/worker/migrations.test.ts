import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// T013: migrations/0001_init.sql matches data-model.md.
const room = (id: string, extra: Record<string, unknown> = {}) => {
  const row = { id, title: '방', room_data: '{}', theme_id: 'cafe', password_hash: 'h', created_at: 1, updated_at: 1, ...extra };
  const cols = Object.keys(row);
  return env.DB.prepare(`INSERT INTO rooms (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row));
};
const report = (reporter: string, extra: Record<string, unknown> = {}) => {
  const row = { target_type: 'room', room_id: 'aB3dE5fG7h', reason: 'spam', reporter_hash: reporter, created_at: 1, ...extra };
  const cols = Object.keys(row);
  return env.DB.prepare(`INSERT INTO reports (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row));
};

describe('rooms', () => {
  it('fills defaults', async () => {
    await room('aB3dE5fG7h').run();
    expect(await env.DB.prepare('SELECT description, online_count, deleted_at, deleted_by FROM rooms').first()).toEqual({
      description: '',
      online_count: 0,
      deleted_at: null,
      deleted_by: null,
    });
  });

  it.each([
    ['id not 10 chars', room('short')],
    ['empty title', room('bad0000001', { title: '' })],
    ['61-char title', room('bad0000001', { title: '가'.repeat(61) })],
    ['301-char description', room('bad0000001', { description: 'a'.repeat(301) })],
    ['unknown deleted_by', room('bad0000001', { deleted_at: 1, deleted_by: 'someone' })],
  ])('rejects %s', async (_, stmt) => {
    await expect(stmt.run()).rejects.toThrow(/CHECK constraint/);
  });

  it('has the newest-first list index', async () => {
    const cols = await env.DB.prepare("SELECT name FROM pragma_index_xinfo('rooms_list') WHERE key = 1 ORDER BY seqno").all();
    expect(cols.results.map((r) => r.name)).toEqual(['deleted_at', 'created_at']);
    const desc = await env.DB.prepare("SELECT \"desc\" FROM pragma_index_xinfo('rooms_list') WHERE name = 'created_at'").first('desc');
    expect(desc).toBe(1);
  });
});

describe('reports', () => {
  it('fills defaults', async () => {
    await report('r1').run();
    expect(await env.DB.prepare('SELECT message_id, message_snapshot, status, resolved_at FROM reports').first()).toEqual({
      message_id: '',
      message_snapshot: null,
      status: 'open',
      resolved_at: null,
    });
  });

  it('one report per device and target', async () => {
    await report('dup-1').run();
    await expect(report('dup-1').run()).rejects.toThrow(/UNIQUE constraint/);
    await report('dup-2').run();
    await report('dup-1', { target_type: 'message', message_id: 'm_1' }).run();
  });

  it.each([
    ['unknown target_type', { target_type: 'user' }],
    ['unknown reason', { reason: 'boring' }],
    ['unknown status', { status: 'closed' }],
  ])('rejects %s', async (_, extra) => {
    await expect(report('bad', extra).run()).rejects.toThrow(/CHECK constraint/);
  });

  it('has the admin list index', async () => {
    const cols = await env.DB.prepare("SELECT name, \"desc\" FROM pragma_index_xinfo('reports_admin') WHERE key = 1 ORDER BY seqno").all();
    expect(cols.results).toEqual([{ name: 'status', desc: 0 }, { name: 'created_at', desc: 1 }]);
  });
});
