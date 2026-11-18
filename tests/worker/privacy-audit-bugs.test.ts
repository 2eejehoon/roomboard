import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker, { app } from '../../src/worker/index.ts';
import { recordServerError } from '../../src/worker/bug-reports.ts';
import { deviceKey, PII } from './rooms-helpers.ts';

// T043, SC-003: every bug path (client report, server error, user report, Cron sync, admin issue) leaves no personal data
// in the bug tables or in what is sent to GitHub, and the user's own words never reach a public issue.
const V1 = '202611130000-1a2b3c4';
const CHUNK = 'index-BXjaK0XS.js';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ISSUES = '/repos/2eejehoon/roomboard/issues';
const assets = {
  fetch: async (input: RequestInfo | URL) =>
    new URL(new Request(input).url).pathname === '/manifest.json' ? Response.json({ version: V1, chunks: [CHUNK] }) : new Response('<!doctype html>'),
} as unknown as Fetcher;
const deployed = { ...env, ASSETS: assets, GITHUB_ISSUES_TOKEN: 'test-token', ADMIN_TOKEN: 'audit-admin-token' };

const KEY = deviceKey(21);
const PERSONAL = `mail a.b@example.com from 203.0.113.77 2001:db8::77 010-1234-5678 key ${KEY}`;
const USER_WORDS = '신고자원문표식';

let sent: string[]; // every body written to GitHub
let issues: { number: number; body: string; labels: { name: string }[] }[];
beforeEach(async () => {
  sent = [];
  issues = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    if (req.url === SITEVERIFY) return Response.json({ success: true });
    const url = new URL(req.url);
    if (url.origin !== 'https://api.github.com') throw new Error(`unexpected fetch ${req.url}`);
    if (req.method === 'GET') return Response.json(issues);
    const body = await req.text();
    sent.push(body);
    if (req.method === 'POST' && url.pathname === ISSUES) {
      const issue = { number: issues.length + 1, body: JSON.parse(body).body as string, labels: [] };
      issues.push(issue);
      return Response.json(issue, { status: 201 });
    }
    return Response.json({ labels: [] });
  });
  await env.DB.batch(['bug_fingerprints', 'github_sync_state', 'token_alerts', 'user_bug_reports'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
afterEach(() => vi.restoreAllMocks());

let ip = 0;
const call = (path: string, body: unknown) =>
  app.request(
    `/api${path}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${++ip}`, 'user-agent': 'audit-agent', authorization: 'Bearer audit-admin-token' },
      body: JSON.stringify(body),
    },
    deployed,
  );
async function sync() {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '*/5 * * * *' }), deployed, ctx);
  await waitOnExecutionContext(ctx);
}
const clientReport = {
  errorName: `AuditError ${KEY}`,
  message: `${PERSONAL} said "${USER_WORDS}"`,
  frames: [
    { file: `https://roomboard.example/assets/${CHUNK}?ip=203.0.113.77&key=${KEY}`, fn: `on_${KEY}`, line: 1, col: 1 },
    { file: 'https://roomboard.example/assets/a.b@example.com-203.0.113.77.js', fn: 'a.b@example.com', line: 2, col: 3 },
  ],
  appVersion: V1,
  view: '3d',
  browser: 'chrome',
};

it('no personal data or user words in the bug tables or in any issue, comment or label sent to GitHub', async () => {
  // Three reports gate the client fingerprint, so the sync both creates its issue and updates it.
  expect((await call('/bug-reports', clientReport)).status).toBe(202);
  const server = new Error(`D1 down for ${PERSONAL} "${USER_WORDS}"`);
  server.name = `ServerAudit ${KEY}`;
  await recordServerError(deployed, server);
  await sync();
  expect(issues).toHaveLength(2);
  for (let i = 0; i < 2; i++) expect((await call('/bug-reports', clientReport)).status).toBe(202);
  await sync();

  const user = { text: `${USER_WORDS} ${PERSONAL}`, context: { view: '2d', appVersion: V1, browser: 'chrome', deviceKey: KEY }, turnstileToken: 'tok' };
  expect((await call('/bug-reports/user', user)).status).toBe(201);
  const id = (await env.DB.prepare('SELECT id FROM user_bug_reports').first<number>('id'))!;
  expect((await call(`/admin/bug-reports/${id}/issue`, { title: `저장 무반응 a.b@example.com 010-1234-5678`, summary: `요약 ${PERSONAL}` })).status).toBe(201);

  expect(issues).toHaveLength(3);
  expect(sent.length).toBeGreaterThan(issues.length); // the update after the gate was sent too
  const github = sent.join('\n');
  expect(github).toContain('AuditError');
  for (const [kind, re] of Object.entries(PII)) expect(github.match(re)?.[0], `GitHub: ${kind}`).toBeUndefined();
  expect(github).not.toContain(USER_WORDS);

  for (const table of ['bug_fingerprints', 'github_sync_state', 'user_bug_reports']) {
    const dump = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${table}"`).all()).results);
    for (const [kind, re] of Object.entries(PII)) expect(dump.match(re)?.[0], `${table}: ${kind}`).toBeUndefined();
    expect(dump).not.toContain('audit-agent');
  }
});
