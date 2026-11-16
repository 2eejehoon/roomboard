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

// T035: migrations/0002_bug_reports.sql matches specs/002-auto-bugfix-loop/data-model.md.
const insert = (table: string, row: Record<string, unknown>) => {
  const cols = Object.keys(row);
  return env.DB.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(row));
};
const fp = (fingerprint: string, extra: Record<string, unknown> = {}) =>
  insert('bug_fingerprints', {
    fingerprint,
    source: 'client',
    error_name: 'TypeError',
    summary: 's',
    frames: '[]',
    count: 1,
    first_seen: 1,
    last_seen: 1,
    app_version_min: 'dev',
    app_version_max: 'dev',
    view_counts: '{}',
    browser_counts: '{}',
    status: 'new',
    ...extra,
  });

describe('bug_fingerprints', () => {
  it('fills defaults', async () => {
    await fp('0123456789abcdef').run();
    expect(await env.DB.prepare('SELECT synced_count, issue_number, gated, fixed_version FROM bug_fingerprints').first()).toEqual({
      synced_count: 0,
      issue_number: null,
      gated: 0,
      fixed_version: null,
    });
  });

  it.each([
    ['unknown source', { source: 'worker' }],
    ['unknown status', { status: 'done' }],
    ['a fingerprint that is not 16 chars', { fingerprint: 'abc' }],
  ])('rejects %s', async (_, extra) => {
    await expect(fp('fedcba9876543210', extra).run()).rejects.toThrow(/CHECK constraint/);
  });

  it('has the (status, last_seen) index', async () => {
    const cols = await env.DB.prepare("SELECT name FROM pragma_index_xinfo('bug_fingerprints_status') WHERE key = 1 ORDER BY seqno").all();
    expect(cols.results.map((r) => r.name)).toEqual(['status', 'last_seen']);
  });
});

describe('github_sync_state', () => {
  it('a day row starts at 0 issues and 0 reports (the intake path creates it, PR #58 review)', async () => {
    await insert('github_sync_state', { day: '2026-11-13' }).run();
    expect(await env.DB.prepare('SELECT issues_created, reports_received FROM github_sync_state').first()).toEqual({ issues_created: 0, reports_received: 0 });
  });
});

describe('user_bug_reports', () => {
  const ubr = (extra: Record<string, unknown> = {}) => insert('user_bug_reports', { text: '버튼이 안 눌려요', context: '{}', status: 'pending', created_at: 1, ...extra });

  it('keeps issue_number empty until issued', async () => {
    await ubr().run();
    expect(await env.DB.prepare('SELECT status, issue_number FROM user_bug_reports').first()).toEqual({ status: 'pending', issue_number: null });
  });

  it.each([
    ['empty text', { text: '' }],
    ['1001-char text', { text: '가'.repeat(1001) }],
    ['unknown status', { status: 'discarded' }],
  ])('rejects %s', async (_, extra) => {
    await expect(ubr(extra).run()).rejects.toThrow(/CHECK constraint/);
  });
});
