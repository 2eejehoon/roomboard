// T036: the 5-minute Cron that turns bug_fingerprints into GitHub issues (contracts/github.md, data-model.md, research R3·R5).
// GitHub and D1 failures are logged and left for the next run, never recorded as server errors: a GitHub outage would
// otherwise become a fingerprint whose issue fails to open (spec Edge Cases).
import type { Frame } from '../core/fingerprint.ts';
import { readManifest, versionKey } from './bug-reports.ts';

const REPO = '2eejehoon/roomboard';
const DAY_ISSUES = 10; // FR-013
const OPEN_ISSUES = 20; // FR-013
const DAY_REPORTS = 1000; // research R4, same as bug-reports.ts
const TOKEN_WARN_MS = 30 * 86_400_000; // research R3
// shortcut: per-run caps keep one run under the Workers free plan's 50 subrequests; the rest waits 5 minutes. Raise on a paid plan.
const UPDATES_PER_RUN = 20;
const REGRESSIONS_PER_RUN = 3;

interface Row {
  fingerprint: string;
  source: string;
  error_name: string;
  summary: string;
  frames: string;
  count: number;
  first_seen: number;
  last_seen: number;
  app_version_min: string;
  app_version_max: string;
  view_counts: string;
  browser_counts: string;
  issue_number: number | null;
  gated: number;
}
interface Issue {
  number: number;
  labels: { name: string }[];
  pull_request?: unknown;
}

type Gh = <T>(method: string, path: string, body?: unknown) => Promise<{ data: T; res: Response }>;
const github =
  (token: string): Gh =>
  async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'roomboard-worker', // GitHub refuses requests without one
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path.replace(/\d+/g, 'n')} ${res.status}`);
    return { data: await res.json(), res };
  };

// Every DB string is untrusted (forged reports): inside a code span, with nothing that can close it or start a new line.
const code = (text: string) => `\`${text.replace(/`/g, "'").replace(/[\r\n]+/g, ' ')}\``;
const utc = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
// Keys come from the request schema's enums (bug-reports.ts), counts are numbers.
const spread = (json: string) => Object.entries(JSON.parse(json) as Record<string, number>).map(([k, n]) => `${k} ${n}`).join(', ') || '-';

function render(r: Row): { title: string; body: string } {
  const frames = JSON.parse(r.frames) as Frame[];
  const body = [
    `<!-- roomboard-fingerprint: ${r.fingerprint} -->`,
    '| 항목 | 값 |',
    '|---|---|',
    `| 지문 | \`${r.fingerprint}\` |`,
    `| 출처 | ${r.source} |`,
    `| 발생 | ${r.count}회 (처음 ${utc(r.first_seen)}, 마지막 ${utc(r.last_seen)}) |`,
    `| 앱 버전 | ${r.app_version_min} ~ ${r.app_version_max} |`,
    `| 화면 | ${spread(r.view_counts)} |`,
    `| 브라우저 | ${spread(r.browser_counts)} |`,
    '',
    '### 오류 요약 (가림 적용)',
    code(`${r.error_name}: ${r.summary}`),
    '',
    '### 스택 (앱 코드)',
    ...frames.map((f) => `- ${code(f.file)} ${code(f.fn)} ${f.line}:${f.col}`),
    '',
    '이 이슈는 자동으로 만들어졌다. 개인정보·사용자 콘텐츠는 들어가지 않는다.',
  ].join('\n');
  return { title: `[bug] ${r.error_name}: ${r.summary.slice(0, 60)}`.replace(/[\r\n]+/g, ' '), body };
}

// GitHub documents "YYYY-MM-DD HH:MM:SS UTC"; an offset ("+0900") is read too. Anything else: no alert rather than a wrong one.
function tokenExpiry(header: string | null): number | undefined {
  const ms = header ? Date.parse(header.replace(' UTC', 'Z').replace(' ', 'T').replace(' ', '')) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

async function each<T>(items: T[], what: string, run: (item: T) => Promise<unknown>): Promise<void> {
  for (const item of items)
    try {
      await run(item);
    } catch (err) {
      console.error(`github sync: ${what} failed`, err instanceof Error ? err.message : typeof err);
    }
}

export async function syncGithub(env: Env, now: number): Promise<void> {
  if (!env.GITHUB_ISSUES_TOKEN) return; // local dev and previews have no token (preview.yml)
  const gh = github(env.GITHUB_ISSUES_TOKEN);
  const db = env.DB;
  const today = new Date(now).toISOString().slice(0, 10);
  const version = (await readManifest(env))?.version ?? 'unknown';
  const rows = async (where: string, limit: number) =>
    (await db.prepare(`SELECT * FROM bug_fingerprints WHERE ${where} ORDER BY first_seen LIMIT ${limit}`).all<Row>()).results;

  // One list answers three things: the open-issue cap, which issues were closed, and when the token expires.
  const { data: listed, res } = await gh<Issue[]>('GET', '/issues?state=open&labels=source:service&per_page=100');
  const open = new Set(listed.filter((i) => !i.pull_request).map((i) => i.number));

  // An issue gone from the list was closed: remember the deployed version, so only a later one counts as a regression.
  const closed = (await rows("status = 'open'", 1000)).filter((r) => !open.has(r.issue_number!));
  await each(closed, 'close', (r) =>
    db.prepare("UPDATE bug_fingerprints SET status = 'closed', fixed_version = ? WHERE fingerprint = ?").bind(version, r.fingerprint).run(),
  );

  const regressed = await rows(
    `status = 'closed' AND fixed_version != 'unknown' AND app_version_max != 'unknown' AND ${versionKey('app_version_max')} > ${versionKey('fixed_version')}`,
    REGRESSIONS_PER_RUN,
  );
  await each(regressed, 'reopen', async (r) => {
    await gh('PATCH', `/issues/${r.issue_number}`, { state: 'open', body: render(r).body });
    await gh('POST', `/issues/${r.issue_number}/labels`, { labels: ['regressed'] });
    await gh('POST', `/issues/${r.issue_number}/comments`, { body: `${r.app_version_max}에서 재발` });
    open.add(r.issue_number!);
    await db.prepare("UPDATE bug_fingerprints SET status = 'open', synced_count = ? WHERE fingerprint = ?").bind(r.count, r.fingerprint).run();
  });

  await each(await rows("status = 'open' AND count > synced_count", UPDATES_PER_RUN), 'update', async (r) => {
    const { data } = await gh<Issue>('PATCH', `/issues/${r.issue_number}`, { body: render(r).body });
    // A client fingerprint is gated from its third report, usually after its issue opened (contracts/github.md).
    if (r.gated && !data.labels.some((l) => l.name === 'agent:gated')) await gh('POST', `/issues/${r.issue_number}/labels`, { labels: ['agent:gated'] });
    await db.prepare('UPDATE bug_fingerprints SET synced_count = ? WHERE fingerprint = ?').bind(r.count, r.fingerprint).run();
  });

  for (const r of await rows("status = 'new'", DAY_ISSUES)) {
    if (open.size >= OPEN_ISSUES) break;
    // shortcut: the slot is taken before the create, so a failed create burns one of the day's 10; the safe direction for a cap.
    const slot = await db
      .prepare(
        `INSERT INTO github_sync_state (day, issues_created) VALUES (?, 1)
         ON CONFLICT (day) DO UPDATE SET issues_created = issues_created + 1 WHERE issues_created < ${DAY_ISSUES}`,
      )
      .bind(today)
      .run();
    if (slot.meta.changes === 0) break;
    await each([r], 'create', async () => {
      const labels = ['source:service', ...(r.gated ? ['agent:gated'] : [])];
      const { data } = await gh<Issue>('POST', '/issues', { ...render(r), labels });
      open.add(data.number);
      await db
        .prepare("UPDATE bug_fingerprints SET status = 'open', issue_number = ?, synced_count = ? WHERE fingerprint = ?")
        .bind(data.number, r.count, r.fingerprint)
        .run();
    });
  }

  // [ops] alerts: no labels, so no agent and not counted against FR-013. The flag is set after the create, so a failure is retried.
  const full = await db.prepare(`SELECT day, reports_received FROM github_sync_state WHERE reports_received >= ${DAY_REPORTS} AND limit_alerted = 0`).all<{ day: string; reports_received: number }>();
  await each(full.results, 'limit alert', async ({ day, reports_received }) => {
    await gh('POST', '/issues', { title: `[ops] 오류 리포트 하루 한도 도달 ${day}`, body: `${day} (UTC)에 오류 리포트 ${reports_received}건을 받아 하루 한도에 닿았다. 그날 남은 리포트는 버려졌다.` });
    await db.prepare('UPDATE github_sync_state SET limit_alerted = 1 WHERE day = ? AND limit_alerted = 0').bind(day).run();
  });

  const expires = tokenExpiry(res.headers.get('github-authentication-token-expiration'));
  if (expires === undefined || expires - now > TOKEN_WARN_MS) return;
  const date = new Date(expires).toISOString().slice(0, 10);
  if (await db.prepare('SELECT 1 FROM token_alerts WHERE expires = ?').bind(date).first()) return;
  await each([date], 'token alert', async () => {
    await gh('POST', '/issues', {
      title: `[ops] 이슈 토큰 만료 임박 ${date}`,
      body: `자동 이슈용 fine-grained PAT가 ${date}에 만료된다. 새 PAT(이 저장소, Issues 읽기·쓰기)를 Environment \`production\`의 \`ISSUES_TOKEN\`에 넣고 배포한다.`,
    });
    await db.prepare('INSERT OR IGNORE INTO token_alerts (expires) VALUES (?)').bind(date).run();
  });
}
