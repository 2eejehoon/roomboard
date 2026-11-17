import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../../src/worker/index.ts';

// T039: user bug reports and their admin routes (contracts/openapi.yaml, FR-004·FR-014, research R9, precedent 2026-11-17-user-bug-reports).
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const GITHUB = 'https://api.github.com/repos/2eejehoon/roomboard/issues';
const TOKEN = 'test-admin-token';
const DAY = 86_400_000;
const adminEnv = { ...env, ADMIN_TOKEN: TOKEN, GITHUB_ISSUES_TOKEN: 'test-token' };

let siteverified: number;
let created: { title: string; body: string; labels: string[] }[];
let githubFails: boolean;
beforeEach(() => {
  siteverified = 0;
  created = [];
  githubFails = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    if (req.url === SITEVERIFY) {
      siteverified++;
      return Response.json({ success: (await req.formData()).get('secret') === 'secret-that-siteverify-accepts' });
    }
    if (req.url === GITHUB && req.method === 'POST') {
      if (githubFails || req.headers.get('authorization') !== 'Bearer test-token') return new Response('{}', { status: 500 });
      created.push(await req.json());
      return Response.json({ number: 100 + created.length, labels: [] }, { status: 201 });
    }
    throw new Error(`unexpected fetch ${req.method} ${req.url}`);
  });
});
afterEach(() => vi.restoreAllMocks());

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;
const context = (over: Record<string, unknown> = {}) => ({ view: '2d', themeId: 'library', connection: 'open', appVersion: '202611130000-1a2b3c4', browser: 'chrome', ...over });
const valid = (over: Record<string, unknown> = {}) => ({ text: '저장 버튼이 안 눌려요', context: context(), turnstileToken: 'token-from-widget', ...over });
const send = (body: unknown, e: Env = env, ip = nextIp()) =>
  app.request('/api/bug-reports/user', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }, e);
const admin = (method: string, path: string, body?: unknown, e: Env = adminEnv, token: string | null = TOKEN) =>
  app.request(
    `/api/admin${path}`,
    {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': nextIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    e,
  );

type Stored = { id: number; text: string; context: string; status: string; issue_number: number | null; created_at: number };
const latest = () => env.DB.prepare('SELECT * FROM user_bug_reports ORDER BY id DESC LIMIT 1').first<Stored>();
const byId = (id: number) => env.DB.prepare('SELECT * FROM user_bug_reports WHERE id = ?').bind(id).first<Stored>();
const insert = async (text: string, createdAt = Date.now(), status = 'pending') =>
  (await env.DB.prepare("INSERT INTO user_bug_reports (text, context, status, created_at) VALUES (?, '{\"view\":\"3d\"}', ?, ?) RETURNING id")
    .bind(text, status, createdAt)
    .first<number>('id'))!;

describe('POST /api/bug-reports/user', () => {
  it('201 and stores the text with identifiers masked, quotes and Korean kept', async () => {
    const text = '방 "카페"에서 저장이 안 돼요. 연락은 a.b@example.com, 010-1234-5678, 203.0.113.9';
    const res = await send(valid({ text: `  ${text}  ` }));
    expect(res.status).toBe(201);
    const row = (await latest())!;
    expect(row.text).toBe('방 "카페"에서 저장이 안 돼요. 연락은 [가림], [가림], [가림]');
    expect(row.status).toBe('pending');
    expect(JSON.parse(row.context)).toEqual(context());
  });

  it('keeps only known context fields; a malformed appVersion becomes unknown', async () => {
    const res = await send(valid({ context: context({ appVersion: 'a.b@example.com', deviceKey: crypto.randomUUID(), themeId: undefined }) }));
    expect(res.status).toBe(201);
    const { appVersion, ...rest } = JSON.parse((await latest())!.context);
    expect(appVersion).toBe('unknown');
    expect(rest).toEqual({ view: '2d', connection: 'open', browser: 'chrome' });
  });

  it('masks before cutting, so a mask that grows the text still fits the 1000-char column', async () => {
    const res = await send(valid({ text: `${'가'.repeat(990)} :: :: ::` }));
    expect(res.status).toBe(201);
    expect((await latest())!.text).toBe(`${'가'.repeat(990)} [가림] [가림]`);
  });

  it.each([
    ['blank text', { text: '   ' }],
    ['text over 1000', { text: '가'.repeat(1001) }],
    ['admin view', { context: context({ view: 'admin' }) }],
    ['unknown theme', { context: context({ themeId: 'a.b@example.com' }) }],
    ['bad fingerprint', { context: context({ recentFingerprints: ['not-hex'] }) }],
    ['no token', { turnstileToken: undefined }],
  ])('400 for %s, before siteverify; nothing stored', async (_, over) => {
    const before = await latest();
    const res = await send(valid(over));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'validation' });
    expect(siteverified).toBe(0);
    expect(await latest()).toEqual(before);
  });

  it('403 turnstile_failed when siteverify says no; nothing stored', async () => {
    const before = await latest();
    const res = await send(valid(), { ...env, TURNSTILE_SECRET: 'secret-that-siteverify-rejects' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'turnstile_failed' });
    expect(await latest()).toEqual(before);
  });

  it('429 after 10 a minute from one IP', async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) expect((await send(valid(), env, ip)).status).toBe(201);
    const res = await send(valid(), env, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});

describe('admin user bug reports', () => {
  it('401 without the admin token', async () => {
    expect((await admin('GET', '/bug-reports', undefined, adminEnv, null)).status).toBe(401);
    const id = await insert('토큰 없이');
    expect((await admin('DELETE', `/bug-reports/${id}`, undefined, adminEnv, 'wrong')).status).toBe(401);
    expect((await admin('POST', `/bug-reports/${id}/issue`, { title: 't', summary: 's' }, adminEnv, null)).status).toBe(401);
    expect(await byId(id)).not.toBeNull();
  });

  it('lists pending reports newest first, with context and the 30-day expiry', async () => {
    const older = await insert('먼저 온 신고', 1_000);
    const newer = await insert('나중 신고', 2_000);
    const issued = await insert('이미 이슈화', 3_000, 'issued');
    const res = await admin('GET', '/bug-reports');
    expect(res.status).toBe(200);
    const { items } = await res.json<{ items: { id: number }[] }>();
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain(issued);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    expect(items.find((i) => i.id === older)).toEqual({ id: older, text: '먼저 온 신고', context: { view: '3d' }, createdAt: 1_000, expiresAt: 1_000 + 30 * DAY });
  });

  it('issue: a public issue with only the admin summary, masked, labelled source:user-report', async () => {
    const id = await insert('원문: 제 이메일은 a.b@example.com');
    const res = await admin('POST', `/bug-reports/${id}/issue`, { title: '저장 버튼 무반응 010-1234-5678', summary: '2D 화면에서 "저장"을 눌러도 반응 없음. 203.0.113.9' });
    expect(res.status).toBe(201);
    const { issueNumber } = await res.json<{ issueNumber: number }>();
    expect(created).toHaveLength(1);
    const [issue] = created;
    expect(issue!.title).toBe('저장 버튼 무반응 [가림]');
    expect(issue!.body).toContain('2D 화면에서 "저장"을 눌러도 반응 없음. [가림]');
    expect(issue!.body).not.toContain('원문');
    expect(issue!.labels).toEqual(['source:user-report']);
    expect(await byId(id)).toMatchObject({ status: 'issued', issue_number: issueNumber });
    // Issued: gone from the list, and a second click makes no second issue.
    const { items } = await (await admin('GET', '/bug-reports')).json<{ items: { id: number }[] }>();
    expect(items.map((i) => i.id)).not.toContain(id);
    expect((await admin('POST', `/bug-reports/${id}/issue`, { title: 't', summary: 's' })).status).toBe(404);
    expect(created).toHaveLength(1);
  });

  it('issue: 400 for a blank title or summary, 404 for a report that does not exist', async () => {
    const id = await insert('검사');
    expect((await admin('POST', `/bug-reports/${id}/issue`, { title: ' ', summary: 's' })).status).toBe(400);
    expect((await admin('POST', `/bug-reports/${id}/issue`, { title: 't', summary: '가'.repeat(2001) })).status).toBe(400);
    expect((await admin('POST', '/bug-reports/999999/issue', { title: 't', summary: 's' })).status).toBe(404);
    expect((await admin('POST', '/bug-reports/x/issue', { title: 't', summary: 's' })).status).toBe(404);
    expect(created).toHaveLength(0);
  });

  it.each([
    ['GitHub fails', adminEnv],
    ['no issue token', { ...adminEnv, GITHUB_ISSUES_TOKEN: '' }],
  ])('issue: 502 when %s; the report stays pending', async (_, e) => {
    githubFails = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await insert('GitHub 장애');
    const res = await admin('POST', `/bug-reports/${id}/issue`, { title: 't', summary: 's' }, e);
    expect(res.status).toBe(502);
    expect(await byId(id)).toMatchObject({ status: 'pending', issue_number: null });
  });

  it('discard deletes the text at once; a second discard is 404', async () => {
    const id = await insert('버릴 신고');
    expect((await admin('DELETE', `/bug-reports/${id}`)).status).toBe(204);
    expect(await byId(id)).toBeNull();
    expect((await admin('DELETE', `/bug-reports/${id}`)).status).toBe(404);
  });
});

describe('30-day deletion (Cron)', () => {
  it('deletes reports older than 30 days, pending and issued alike, even without the GitHub token', async () => {
    const now = Date.UTC(2026, 10, 17);
    const old = await insert('오래된 신고', now - 30 * DAY - 1);
    const oldIssued = await insert('오래된 이슈화', now - 31 * DAY, 'issued');
    const recent = await insert('최근 신고', now - 29 * DAY);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: now, cron: '*/5 * * * *' }), { ...env, GITHUB_ISSUES_TOKEN: '' }, ctx);
    await waitOnExecutionContext(ctx);
    expect(await byId(old)).toBeNull();
    expect(await byId(oldIssued)).toBeNull();
    expect(await byId(recent)).not.toBeNull();
  });
});
