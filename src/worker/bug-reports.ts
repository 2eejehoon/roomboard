// T036 (a): POST /api/bug-reports and server error recording (contracts/openapi.yaml, data-model.md bug_fingerprints,
// research R4·R5). Nothing from the client is trusted: every string is redacted and cut again here, and the fingerprint is ours.
import type { Context } from 'hono';
import { bugReportIssueRequest, clientErrorReport, userBugReport } from '../core/api-schemas.ts';
import { fileName, fingerprint, isVendor, parseStack, type Frame } from '../core/fingerprint.ts';
import { redact, redactIds } from '../core/redact.ts';
import { github } from './github-sync.ts';
import { verifyTurnstile } from './turnstile.ts';

type C = Context<{ Bindings: Env }>;
interface Manifest {
  version: string;
  chunks: string[];
}
interface Occurrence {
  source: 'client' | 'server';
  errorName: string;
  message: string;
  frames: Frame[];
  appVersion: string;
  view?: string;
  browser?: string;
  /** FR-015 (b): the fingerprint frames are chunks of the deployed build. Server errors always are. */
  inBuild: boolean;
}

const DAY_LIMIT = 1000; // research R4
const VERSION = /^(\d{12}-[0-9a-f]{7,12}|dev)$/;
const sha256 = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
// Redact before cutting: a cut can split an email or token so that redact no longer sees it.
const clip = (text: string, max: number) => redact(text).slice(0, max);
// research R4: 'dev' sorts before every build, so it cannot be compared as a string.
export const versionKey = (sql: string) => `CASE ${sql} WHEN 'dev' THEN '' ELSE substr(${sql}, 1, 12) END`;
const pickVersion = (col: string, wins: '<' | '>') =>
  `CASE WHEN excluded.${col} = 'unknown' THEN ${col} WHEN ${col} = 'unknown' OR ${versionKey(`excluded.${col}`)} ${wins} ${versionKey(col)} THEN excluded.${col} ELSE ${col} END`;
// Distribution keys come from the request schema's enums, never free text.
const bump = (col: string, n: number) => `CASE WHEN ?${n} IS NULL THEN ${col} ELSE json_set(${col}, ?${n}, coalesce(json_extract(${col}, ?${n}), 0) + 1) END`;

const DAY_SQL = `INSERT INTO github_sync_state (day, reports_received) VALUES (?, 1)
  ON CONFLICT (day) DO UPDATE SET reports_received = reports_received + 1 WHERE reports_received < ${DAY_LIMIT}`;
const UPSERT_SQL = `INSERT INTO bug_fingerprints
  (fingerprint, source, error_name, summary, frames, count, first_seen, last_seen, app_version_min, app_version_max, view_counts, browser_counts, status, gated)
  VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6, ?7, ?7, ?8, ?9, 'new', ?12)
  ON CONFLICT (fingerprint) DO UPDATE SET
    count = count + 1,
    last_seen = excluded.last_seen,
    app_version_min = ${pickVersion('app_version_min', '<')},
    app_version_max = ${pickVersion('app_version_max', '>')},
    view_counts = ${bump('view_counts', 10)},
    browser_counts = ${bump('browser_counts', 11)},
    gated = CASE WHEN ?13 AND count + 1 >= 3 THEN 1 ELSE gated END`;

// The assets binding serves by path; the host is ignored, and Cron and Durable Objects have no request URL.
export async function readManifest(env: Env): Promise<Manifest | undefined> {
  try {
    // Before the build writes it (PR (b)) the asset server answers with index.html, which fails to parse.
    return await (await env.ASSETS.fetch('https://assets.local/manifest.json')).json<Manifest>();
  } catch {
    return undefined;
  }
}

// chunks: names from the deployed build, kept as is; any other name is redacted, since a 23+ char module name in a real
// chunk name matches the long-token pattern and would merge fingerprints (PR #61 review).
async function record(env: Env, o: Occurrence, chunks: string[] = []): Promise<void> {
  const { meta } = await env.DB.prepare(DAY_SQL).bind(new Date().toISOString().slice(0, 10)).run();
  if (meta.changes === 0) return; // over the day's limit: dropped without a trace (FR-003)

  const frames = o.frames
    .filter((f) => !isVendor(f.file))
    .slice(0, 20)
    .map((f) => {
      const name = fileName(f.file);
      return { file: chunks.includes(name) ? name : clip(name, 200), fn: clip(f.fn, 100), line: f.line, col: f.col };
    });
  const errorName = clip(o.errorName, 100);
  const now = Date.now();
  const path = (key?: string) => (key ? `$."${key}"` : null);
  await env.DB.prepare(UPSERT_SQL)
    .bind(
      await fingerprint(errorName, frames, sha256),
      o.source,
      errorName,
      clip(o.message, 300),
      JSON.stringify(frames),
      now,
      o.appVersion,
      JSON.stringify(o.view ? { [o.view]: 1 } : {}),
      JSON.stringify(o.browser ? { [o.browser]: 1 } : {}),
      path(o.view),
      path(o.browser),
      o.source === 'server' ? 1 : 0, // FR-015: a server error runs the agent at once
      o.inBuild ? 1 : 0,
    )
    .run();
}

export async function receiveBugReport(c: C): Promise<Response> {
  // Always 202, so a sender cannot tell what was kept. A failure here is never recorded as a server error (spec Edge Cases).
  try {
    // research R4: the IP is the limiter key only, never stored. Over the limit is dropped like everything else, as 202.
    const { success } = await c.env.RL_BUG_REPORT.limit({ key: c.req.header('cf-connecting-ip') ?? 'unknown' });
    const parsed = success ? clientErrorReport.safeParse(await c.req.json()) : undefined;
    if (parsed?.success) {
      const { appVersion, ...report } = parsed.data;
      const manifest = await readManifest(c.env);
      const key = (v: string) => (v === 'dev' ? '' : v.slice(0, 12));
      // research R4: a version that is malformed or newer than the deployed build could carry text into a public issue or reopen one.
      const known = manifest && VERSION.test(appVersion) && key(appVersion) <= key(manifest.version);
      const top = report.frames.filter((f) => !isVendor(f.file)).slice(0, 3);
      const inBuild = !!manifest && top.length > 0 && top.every((f) => manifest.chunks.includes(fileName(f.file)));
      await record(c.env, { source: 'client', ...report, appVersion: known ? appVersion : 'unknown', inBuild }, manifest?.chunks);
    }
  } catch (err) {
    console.error('bug report not stored', err instanceof Error ? err.name : typeof err);
  }
  return c.body(null, 202);
}

export async function recordServerError(env: Env, err: Error): Promise<void> {
  const frames = parseStack(err);
  const version = (await readManifest(env))?.version ?? 'unknown';
  await record(env, { source: 'server', errorName: err.name, message: err.message, frames, appVersion: version, inBuild: true });
}

// T041: user bug reports (FR-004·FR-014, research R9, precedent 2026-11-17-user-bug-reports). The RL_REPORT limit runs before this
// (index.ts), validation before siteverify so a 400 does not spend the widget token (precedent 2026-11-08-create-room-check-order).
const KEEP_MS = 30 * 86_400_000;
// Mask, then cut: a mask can be longer than what it hides, and the column CHECK allows 1000.
const clipIds = (text: string, max: number) => redactIds(text).slice(0, max);

export async function receiveUserBugReport(c: C): Promise<Response> {
  const parsed = userBugReport.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ code: 'validation' }, 400);
  const { text, context, turnstileToken } = parsed.data;
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, turnstileToken))) return c.json({ code: 'turnstile_failed' }, 403);
  const stored = { ...context, appVersion: VERSION.test(context.appVersion) ? context.appVersion : 'unknown' };
  await c.env.DB.prepare("INSERT INTO user_bug_reports (text, context, status, created_at) VALUES (?, ?, 'pending', ?)")
    .bind(clipIds(text, 1000), JSON.stringify(stored), Date.now())
    .run();
  return c.body(null, 201);
}

// shortcut: the newest 100 only, the contract has no cursor; add one if pending reports ever pile up past that.
export async function listUserBugReports(c: C): Promise<Response> {
  const { results } = await c.env.DB.prepare("SELECT id, text, context, created_at FROM user_bug_reports WHERE status = 'pending' ORDER BY id DESC LIMIT 100").all<{
    id: number;
    text: string;
    context: string;
    created_at: number;
  }>();
  const items = results.map((r) => ({ id: r.id, text: r.text, context: JSON.parse(r.context) as unknown, createdAt: r.created_at, expiresAt: r.created_at + KEEP_MS }));
  return c.json({ items });
}

const pendingId = async (c: C) => {
  const id = c.req.param('id') ?? '';
  return /^\d+$/.test(id) && (await c.env.DB.prepare("SELECT 1 FROM user_bug_reports WHERE id = ? AND status = 'pending'").bind(Number(id)).first()) ? Number(id) : undefined;
};

// Only the admin's title and summary go public (contracts/github.md). No claim before the create: the admin screen stops a double click.
export async function issueUserBugReport(c: C): Promise<Response> {
  const id = await pendingId(c);
  if (id === undefined) return c.json({ code: 'not_found' }, 404);
  const parsed = bugReportIssueRequest.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ code: 'validation' }, 400);
  let issueNumber: number;
  try {
    if (!c.env.GITHUB_ISSUES_TOKEN) throw new Error('no GITHUB_ISSUES_TOKEN');
    const body = `${clipIds(parsed.data.summary, 2000)}\n\n사용자 신고를 운영자가 요약한 이슈다. 신고 원문은 공개하지 않는다.`;
    const { data } = await github(c.env.GITHUB_ISSUES_TOKEN)<{ number: number }>('POST', '/issues', { title: clipIds(parsed.data.title, 80), body, labels: ['source:user-report'] });
    issueNumber = data.number;
  } catch (err) {
    console.error('user bug report issue failed', err instanceof Error ? err.message : typeof err);
    return c.body(null, 502);
  }
  await c.env.DB.prepare("UPDATE user_bug_reports SET status = 'issued', issue_number = ? WHERE id = ?").bind(issueNumber, id).run();
  return c.json({ issueNumber }, 201);
}

export async function discardUserBugReport(c: C): Promise<Response> {
  const id = c.req.param('id') ?? '';
  const { meta } = /^\d+$/.test(id) ? await c.env.DB.prepare('DELETE FROM user_bug_reports WHERE id = ?').bind(Number(id)).run() : { meta: { changes: 0 } };
  return meta.changes ? c.body(null, 204) : c.json({ code: 'not_found' }, 404);
}

/** The 5-minute Cron (index.ts), apart from the GitHub sync so it runs where there is no issue token. */
export async function purgeUserBugReports(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM user_bug_reports WHERE created_at < ?').bind(now - KEEP_MS).run();
}
