import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../../src/worker/index.ts';

// T033: the 5-minute Cron sync against a fake GitHub (contracts/github.md, data-model.md, research R3·R5, quickstart B5~B8).
const V1 = '202611130000-1a2b3c4';
const V2 = '202611140000-5d6e7f8';
const CHUNKS = ['index-BXjaK0XS.js', 'room3d-8f1cAb12.js'];
const assets = (version: string) =>
  ({
    fetch: async (input: RequestInfo | URL) =>
      new URL(new Request(input).url).pathname === '/manifest.json' ? Response.json({ version, chunks: CHUNKS }) : new Response('<!doctype html>'),
  }) as unknown as Fetcher;
const deployed = (version = V1) => ({ ...env, ASSETS: assets(version), GITHUB_ISSUES_TOKEN: 'test-token' });

interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
  comments: string[];
}
const REPO = 'https://api.github.com/repos/2eejehoon/roomboard';
let issues: Issue[];
let expiration: string | undefined;
let failCreate: boolean;
let calls: number;

// In-memory GitHub: only the endpoints the sync is allowed to use. Anything else fails the test.
function fakeGithub(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin !== 'https://api.github.com') throw new Error(`unexpected fetch ${req.url}`);
  calls++;
  if (req.headers.get('authorization') !== 'Bearer test-token' || !req.headers.get('user-agent')) return Promise.resolve(new Response('{}', { status: 403 }));
  const headers = expiration ? { 'github-authentication-token-expiration': expiration } : undefined;
  const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status, headers }));
  const view = (i: Issue) => ({ number: i.number, title: i.title, body: i.body, state: i.state, labels: i.labels.map((name) => ({ name })) });
  const path = url.pathname.slice(new URL(REPO).pathname.length);
  const one = /^\/issues\/(\d+)(\/labels|\/comments)?$/.exec(path);
  const issue = one ? issues.find((i) => i.number === Number(one[1])) : undefined;
  return (async () => {
    const body = req.method === 'GET' ? undefined : await req.json<Record<string, unknown>>();
    if (req.method === 'GET' && path === '/issues') {
      expect(url.searchParams.get('state')).toBe('open');
      const label = url.searchParams.get('labels');
      return json(issues.filter((i) => i.state === 'open' && (!label || i.labels.includes(label))).map(view));
    }
    if (req.method === 'POST' && path === '/issues') {
      if (failCreate) return json({ message: 'boom' }, 500);
      const created: Issue = { number: issues.length + 1, title: body!.title as string, body: body!.body as string, labels: (body!.labels as string[]) ?? [], state: 'open', comments: [] };
      issues.push(created);
      return json(view(created), 201);
    }
    if (issue && req.method === 'PATCH' && !one![2]) {
      Object.assign(issue, body);
      return json(view(issue));
    }
    if (issue && req.method === 'POST' && one![2] === '/labels') {
      for (const l of body!.labels as string[]) if (!issue.labels.includes(l)) issue.labels.push(l);
      return json(issue.labels.map((name) => ({ name })));
    }
    if (issue && req.method === 'POST' && one![2] === '/comments') {
      issue.comments.push(body!.body as string);
      return json({}, 201);
    }
    throw new Error(`unexpected GitHub call ${req.method} ${req.url}`);
  })();
}

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-17T12:00:00Z');
async function sync(e: Env = deployed(), at = T0) {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: at, cron: '*/5 * * * *' }), e, ctx);
  await waitOnExecutionContext(ctx);
}

let ipSeq = 0;
const reportError = (errorName: string, extra: Record<string, unknown> = {}, e: Env = deployed()) =>
  app.request(
    '/api/bug-reports',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `2001:db8::${(++ipSeq).toString(16)}` },
      body: JSON.stringify({
        errorName,
        message: "Cannot read properties of undefined (reading 'p')",
        frames: [
          { file: 'https://roomboard.example/assets/room3d-8f1cAb12.js', fn: 'applyPeerMoved', line: 1, col: 20431 },
          { file: 'https://roomboard.example/assets/index-BXjaK0XS.js', fn: 'onMessage', line: 1, col: 300 },
        ],
        appVersion: V1,
        view: '3d',
        browser: 'chrome',
        ...extra,
      }),
    },
    e,
  );

let fpSeq = 0;
async function insertFingerprint(extra: Record<string, unknown> = {}) {
  const row = {
    fingerprint: (++fpSeq).toString(16).padStart(16, '0'),
    source: 'server',
    error_name: 'Error',
    summary: 'D1 down',
    frames: JSON.stringify([{ file: 'index.js', fn: 'listRooms', line: 1, col: 2 }]),
    count: 1,
    first_seen: T0 - 1000 + fpSeq,
    last_seen: T0 - 1000 + fpSeq,
    app_version_min: V1,
    app_version_max: V1,
    view_counts: '{}',
    browser_counts: '{}',
    status: 'new',
    gated: 1,
    ...extra,
  };
  const cols = Object.keys(row);
  await env.DB.prepare(`INSERT INTO bug_fingerprints (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();
  return row.fingerprint;
}
const fpRow = (fp: string) => env.DB.prepare('SELECT * FROM bug_fingerprints WHERE fingerprint = ?').bind(fp).first<Record<string, unknown>>();
const bugIssues = () => issues.filter((i) => i.labels.includes('source:service'));
const opsIssues = () => issues.filter((i) => i.title.startsWith('[ops]'));

beforeEach(async () => {
  issues = [];
  expiration = undefined;
  failCreate = false;
  calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(fakeGithub);
  await env.DB.batch(['bug_fingerprints', 'github_sync_state', 'token_alerts'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});

describe('Cron GitHub sync: bug issues', () => {
  it('B5: the same error 3 times and another once make 2 issues in the contract format; the first says 3 and is gated', async () => {
    for (let i = 0; i < 3; i++) expect((await reportError('SameError')).status).toBe(202);
    await reportError('OtherError', { view: '2d', browser: 'safari' });
    await sync();
    expect(bugIssues()).toHaveLength(2);
    const [same, other] = ['SameError', 'OtherError'].map((n) => issues.find((i) => i.title.startsWith(`[bug] ${n}: `))!);
    expect(same!.title).toBe('[bug] SameError: Cannot read properties of undefined (reading [가림])');
    expect(same!.labels.sort()).toEqual(['agent:gated', 'source:service']);
    expect(other!.labels).toEqual(['source:service']);
    expect(same!.body).toMatch(/^<!-- roomboard-fingerprint: [0-9a-f]{16} -->\n\| 항목 \| 값 \|/);
    expect(same!.body).toContain('| 출처 | client |');
    expect(same!.body).toContain('| 발생 | 3회 (처음 ');
    expect(same!.body).toContain(`| 앱 버전 | ${V1} ~ ${V1} |`);
    expect(same!.body).toContain('| 화면 | 3d 3 |');
    expect(same!.body).toContain('| 브라우저 | chrome 3 |');
    expect(same!.body).toContain('- `room3d-8f1cAb12.js` `applyPeerMoved` 1:20431');
    expect(other!.body).toContain('| 화면 | 2d 1 |');
    const rows = await env.DB.prepare("SELECT status, synced_count, count, issue_number FROM bug_fingerprints ORDER BY count DESC").all();
    expect(rows.results).toEqual([
      { status: 'open', synced_count: 3, count: 3, issue_number: same!.number },
      { status: 'open', synced_count: 1, count: 1, issue_number: other!.number },
    ]);
  });

  it('B6: masked text stays masked, and forged names cannot leave their code span (no mentions, no markdown)', async () => {
    await reportError('LeakError', { message: 'a.b@example.com 123e4567-e89b-12d3-a456-426614174000 "비밀 방 제목"' });
    await insertFingerprint({ error_name: 'Evil`Error\n@octocat', summary: 'x`\n# heading', frames: JSON.stringify([{ file: 'a`b.js', fn: 'f`n\n@octocat', line: 1, col: 1 }]) });
    await sync();
    const leak = issues.find((i) => i.title.startsWith('[bug] LeakError'))!;
    expect(leak.body).not.toMatch(/example\.com|123e4567|비밀 방/);
    expect(leak.body).toContain('[가림]');
    const evil = issues.find((i) => i.title.startsWith('[bug] Evil'))!;
    expect(evil.title).not.toContain('\n');
    expect(evil.body).not.toMatch(/\n@octocat|\n# heading|Evil`|a`b|f`n/);
    expect(evil.body).toContain("`Evil'Error @octocat: x' # heading`");
    expect(evil.body).toContain("- `a'b.js` `f'n @octocat` 1:1");
  });

  it('updates the body of an existing issue instead of opening another, and adds agent:gated once a client error becomes gated', async () => {
    await reportError('LateGate');
    await sync();
    expect(bugIssues()).toHaveLength(1);
    expect(bugIssues()[0]!.labels).toEqual(['source:service']);
    await reportError('LateGate');
    await reportError('LateGate');
    await sync(deployed(), T0 + 5 * 60_000);
    expect(bugIssues()).toHaveLength(1);
    expect(bugIssues()[0]!.body).toContain('| 발생 | 3회 ');
    expect(bugIssues()[0]!.labels.sort()).toEqual(['agent:gated', 'source:service']);
  });

  it('calls GitHub for nothing but the open-issue list when nothing changed', async () => {
    await insertFingerprint();
    await sync();
    calls = 0;
    await sync(deployed(), T0 + 5 * 60_000);
    expect(calls).toBe(1);
  });

  it('B7: opens at most 10 new issues a day; the rest wait (counted) for the next day', async () => {
    const fps = [];
    for (let i = 0; i < 11; i++) fps.push(await insertFingerprint());
    await sync();
    expect(bugIssues()).toHaveLength(10);
    expect((await fpRow(fps[10]!))!.status).toBe('new');
    await sync(deployed(), T0 + 5 * 60_000);
    expect(bugIssues()).toHaveLength(10);
    await sync(deployed(), T0 + DAY);
    expect(bugIssues()).toHaveLength(11);
    expect((await fpRow(fps[10]!))!.status).toBe('open');
  });

  it('opens no new issue while 20 bug issues are open (FR-013); other open issues do not count', async () => {
    for (let n = 1; n <= 20; n++) issues.push({ number: n, title: `[bug] ${n}`, body: '', labels: ['source:service'], state: 'open', comments: [] });
    issues.push({ number: 21, title: 'a person', body: '', labels: [], state: 'open', comments: [] });
    const fp = await insertFingerprint();
    await sync();
    expect(issues).toHaveLength(21);
    expect((await fpRow(fp))!.status).toBe('new');
    issues[0]!.state = 'closed';
    await sync(deployed(), T0 + 5 * 60_000);
    expect(issues).toHaveLength(22);
  });

  it('B8: a closed issue records the deployed version; a later version reopens it with regressed and a comment', async () => {
    const fp = await insertFingerprint();
    await sync();
    const issue = bugIssues()[0]!;
    issue.state = 'closed';
    await sync(deployed(V1), T0 + 5 * 60_000);
    expect(await fpRow(fp)).toMatchObject({ status: 'closed', fixed_version: V1 });

    // An old client (V1) after the close is not a regression.
    await env.DB.prepare('UPDATE bug_fingerprints SET count = count + 1 WHERE fingerprint = ?').bind(fp).run();
    await sync(deployed(V2), T0 + 10 * 60_000);
    expect(issue.state).toBe('closed');

    await env.DB.prepare('UPDATE bug_fingerprints SET count = count + 1, app_version_max = ? WHERE fingerprint = ?').bind(V2, fp).run();
    await sync(deployed(V2), T0 + 15 * 60_000);
    expect(issue.state).toBe('open');
    expect(issue.labels).toContain('regressed');
    expect(issue.comments).toEqual([`${V2}에서 재발`]);
    expect(issue.body).toContain('| 발생 | 3회 ');
    expect(await fpRow(fp)).toMatchObject({ status: 'open', synced_count: 3 });
    expect(bugIssues()).toHaveLength(1);
  });

  it('stops creating at the first failed create, so a GitHub outage burns one of the day slots, not all of them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 3; i++) await insertFingerprint();
    failCreate = true;
    await sync();
    expect(await env.DB.prepare('SELECT issues_created FROM github_sync_state WHERE day = ?').bind('2026-11-17').first('issues_created')).toBe(1);
    failCreate = false;
    await sync(deployed(), T0 + 5 * 60_000);
    expect(bugIssues()).toHaveLength(3);
  });

  it('reuses the open issue that already carries the fingerprint when saving its number failed after the create', async () => {
    const fp = await insertFingerprint();
    issues.push({ number: 1, title: '[bug] Error: D1 down', body: `<!-- roomboard-fingerprint: ${fp} -->\n`, labels: ['source:service'], state: 'open', comments: [] });
    await sync();
    expect(issues).toHaveLength(1);
    expect(await fpRow(fp)).toMatchObject({ status: 'open', issue_number: 1, synced_count: 1 });
    expect(await env.DB.prepare('SELECT issues_created FROM github_sync_state WHERE day = ?').bind('2026-11-17').first('issues_created')).toBeNull();
  });

  it('does nothing without the token (local dev, preview)', async () => {
    await insertFingerprint();
    await sync({ ...deployed(), GITHUB_ISSUES_TOKEN: '' });
    expect(calls).toBe(0);
  });

  it('a GitHub failure is logged by name only and never recorded as a server error (spec Edge Cases)', async () => {
    const logged: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => void logged.push(...a));
    await insertFingerprint();
    failCreate = true;
    await sync();
    expect(bugIssues()).toHaveLength(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM bug_fingerprints').first('n'))).toBe(1);
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain('test-token');
  });
});

describe('Cron GitHub sync: operator alerts', () => {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const setReceived = (d: string, n: number) =>
    env.DB.prepare('INSERT INTO github_sync_state (day, reports_received) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET reports_received = excluded.reports_received').bind(d, n).run();

  it('the day limit opens one [ops] issue with the date and count only, no labels, outside the issue cap', async () => {
    await setReceived(day(T0), 1000);
    await sync();
    expect(opsIssues()).toEqual([expect.objectContaining({ title: `[ops] 오류 리포트 하루 한도 도달 ${day(T0)}`, labels: [] })]);
    expect(opsIssues()[0]!.body).toContain(day(T0));
    expect(opsIssues()[0]!.body).toContain('1000');
    await sync(deployed(), T0 + 5 * 60_000);
    expect(opsIssues()).toHaveLength(1);
    expect(await env.DB.prepare('SELECT issues_created, limit_alerted FROM github_sync_state WHERE day = ?').bind(day(T0)).first()).toEqual({ issues_created: 0, limit_alerted: 1 });
  });

  it('a failed alert is tried again by the next Cron, also after midnight for the day before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const late = Date.parse('2026-11-17T23:58:00Z');
    await setReceived(day(late), 1000);
    failCreate = true;
    await sync(deployed(), late);
    expect(opsIssues()).toHaveLength(0);
    failCreate = false;
    await sync(deployed(), late + 5 * 60_000);
    expect(opsIssues().map((i) => i.title)).toEqual(['[ops] 오류 리포트 하루 한도 도달 2026-11-17']);
  });

  it('a day below the limit opens nothing', async () => {
    await setReceived(day(T0), 999);
    await sync();
    expect(opsIssues()).toHaveLength(0);
  });

  it('opens one [ops] issue when the token expires within 30 days, read from the GitHub response header', async () => {
    expiration = '2026-12-10 00:00:00 UTC';
    await sync();
    expect(opsIssues()).toEqual([expect.objectContaining({ title: '[ops] 이슈 토큰 만료 임박 2026-12-10', labels: [] })]);
    expect(opsIssues()[0]!.body).toContain('ISSUES_TOKEN');
    await sync(deployed(), T0 + 5 * 60_000);
    expect(opsIssues()).toHaveLength(1);
    expiration = '2026-12-12 00:00:00 UTC'; // a new token, also close to expiring
    await sync(deployed(), T0 + 10 * 60_000);
    expect(opsIssues()).toHaveLength(2);
  });

  it('says nothing for a token with more than 30 days left, no expiration, or a header it cannot read', async () => {
    for (const e of ['2027-01-01 00:00:00 UTC', undefined, 'soon']) {
      expiration = e;
      await sync();
    }
    expect(opsIssues()).toHaveLength(0);
  });
});
