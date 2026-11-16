// T036 (a): POST /api/bug-reports and server error recording (contracts/openapi.yaml, data-model.md bug_fingerprints,
// research R4·R5). Nothing from the client is trusted: every string is redacted and cut again here, and the fingerprint is ours.
import type { Context } from 'hono';
import { clientErrorReport } from '../core/api-schemas.ts';
import { fingerprint, isVendor, type Frame } from '../core/fingerprint.ts';
import { redact } from '../core/redact.ts';

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
// The last path piece only: origin, path, query and hash can carry personal data or tokens (research R4).
const fileName = (file: string) => file.split(/[?#]/)[0]!.split('/').pop()!;
// research R4: 'dev' sorts before every build, so it cannot be compared as a string.
const versionKey = (sql: string) => `CASE ${sql} WHEN 'dev' THEN '' ELSE substr(${sql}, 1, 12) END`;
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

async function readManifest(env: Env, url: string): Promise<Manifest | undefined> {
  try {
    // Before the build writes it (PR (b)) the asset server answers with index.html, which fails to parse.
    return await (await env.ASSETS.fetch(new URL('/manifest.json', url))).json<Manifest>();
  } catch {
    return undefined;
  }
}

async function record(env: Env, o: Occurrence): Promise<void> {
  const { meta } = await env.DB.prepare(DAY_SQL).bind(new Date().toISOString().slice(0, 10)).run();
  if (meta.changes === 0) return; // over the day's limit: dropped without a trace (FR-003)

  const frames = o.frames
    .filter((f) => !isVendor(f.file))
    .slice(0, 20)
    .map((f) => ({ file: clip(fileName(f.file), 200), fn: clip(f.fn, 100), line: f.line, col: f.col }));
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
    const parsed = clientErrorReport.safeParse(await c.req.json());
    if (parsed.success) {
      const { appVersion, ...report } = parsed.data;
      const manifest = await readManifest(c.env, c.req.url);
      const key = (v: string) => (v === 'dev' ? '' : v.slice(0, 12));
      // research R4: a version that is malformed or newer than the deployed build could carry text into a public issue or reopen one.
      const known = manifest && VERSION.test(appVersion) && key(appVersion) <= key(manifest.version);
      const top = report.frames.filter((f) => !isVendor(f.file)).slice(0, 3);
      const inBuild = !!manifest && top.length > 0 && top.every((f) => manifest.chunks.includes(fileName(f.file)));
      await record(c.env, { source: 'client', ...report, appVersion: known ? appVersion : 'unknown', inBuild });
    }
  } catch (err) {
    console.error('bug report not stored', err instanceof Error ? err.name : typeof err);
  }
  return c.body(null, 202);
}

// "    at [async] fn (file:line:col)" or "    at file:line:col"
const STACK_LINE = /^\s*at (?:async )?(?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/;

export async function recordServerError(env: Env, url: string, err: Error): Promise<void> {
  // Skip the "name: message" lines: a message can echo request content and look like a frame (same as logError in index.ts).
  const header = `${err.name}: ${err.message}`.split('\n').length;
  const frames = (err.stack ?? '')
    .split('\n')
    .slice(header)
    .flatMap((line) => {
      const m = STACK_LINE.exec(line);
      return m ? [{ file: m[2]!, fn: m[1] ?? '', line: Number(m[3]), col: Number(m[4]) }] : [];
    });
  const version = (await readManifest(env, url))?.version ?? 'unknown';
  await record(env, { source: 'server', errorName: err.name, message: err.message, frames, appVersion: version, inBuild: true });
}
