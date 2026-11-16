import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/mistake-tally.mjs');
let dir: string;

type Fixture = { pulls: object[]; comments: object[]; guardrails: object[] };

// Fake gh: answers the three list calls from fixture.json, logs every call, returns issue URL #77 on create.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n');
const f = JSON.parse(fs.readFileSync(process.env.GH_FIXTURE, 'utf8'));
const url = args.find((a) => a.startsWith('repos/')) || '';
const rows = url.includes('/pulls/comments') ? f.comments : url.includes('/pulls?') ? f.pulls : url.includes('/issues?') ? f.guardrails : null;
if (rows) for (const r of rows) console.log(JSON.stringify(r));
else if (args[0] === 'issue' && args[1] === 'create') console.log('https://github.com/o/r/issues/77');
`;

const run = (event: object, eventName: string, fixture: Fixture) => {
  writeFileSync(join(dir, 'event.json'), JSON.stringify(event));
  writeFileSync(join(dir, 'fixture.json'), JSON.stringify(fixture));
  writeFileSync(join(dir, 'gh.log'), '');
  const r = spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GH_REPO: 'o/r',
      GH_LOG: join(dir, 'gh.log'),
      GH_FIXTURE: join(dir, 'fixture.json'),
      GITHUB_EVENT_PATH: join(dir, 'event.json'),
      GITHUB_EVENT_NAME: eventName,
    },
  });
  const calls = readFileSync(join(dir, 'gh.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);
  return { ...r, writes: calls.filter((c) => c[0] !== 'api') };
};

const pr = (number: number, labels: string[]) => ({ number, merged_at: '2026-11-12T00:00:00Z', merge_commit_sha: `sha${number}`, labels: labels.map((name) => ({ name })) });
const comment = (id: number, body: string, login = 'claude[bot]', author_association = 'NONE', pull = 1) => ({
  id,
  body,
  user: { login },
  author_association,
  commit_id: `c${id}`,
  pull_request_url: `https://api.github.com/repos/o/r/pulls/${pull}`,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mistake-tally-'));
  writeFileSync(join(dir, 'gh'), FAKE_GH);
  chmodSync(join(dir, 'gh'), 0o755);
});

describe('scripts/mistake-tally.mjs', () => {
  it('opens a queued guardrail issue when a merged PR makes the second record', () => {
    const event = { action: 'closed', pull_request: pr(5, ['cause:skip-test']) };
    // The just-merged PR is missing from the list (lag): the event payload still counts.
    const r = run(event, 'pull_request_target', { pulls: [pr(3, ['cause:skip-test'])], comments: [], guardrails: [] });
    expect(r.status, r.stderr).toBe(0);
    const create = r.writes.find((c) => c[1] === 'create');
    expect(create).toContain('[guardrail] skip-test');
    // Queued, not dispatched: a dispatched run can be cancelled while pending, and nothing would retry it (#64 review).
    expect(create?.join(' ')).toContain('kind:guardrail,agent:run,agent:queued');
    expect(create?.join(' ')).toContain('sha3');
    expect(r.writes.filter((c) => c[0] === 'workflow')).toEqual([]);
  });

  it('comments on the open guardrail issue instead of opening a second one', () => {
    const event = { action: 'created', comment: comment(9, '차단 [mistake:skip-test]') };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [pr(3, ['cause:skip-test'])],
      comments: [comment(9, '차단 [mistake:skip-test]')],
      guardrails: [{ number: 21, title: '[guardrail] skip-test', state: 'open' }],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes.map((c) => c.slice(0, 3))).toEqual([['issue', 'comment', '21']]);
  });

  it('counts the same tag re-posted on one PR once', () => {
    const event = { action: 'created', comment: comment(10, '[mistake:skip-test]') };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [],
      comments: [comment(9, '[mistake:skip-test]'), comment(10, '[mistake:skip-test]')],
      guardrails: [],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes).toEqual([]);
  });

  it('opens a category left at 2 by a cancelled run, on an event with no tag', () => {
    const event = { action: 'created', comment: comment(11, '태그 없음') };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [pr(3, ['cause:pii-in-logs']), pr(4, ['cause:pii-in-logs'])],
      comments: [comment(11, '태그 없음')],
      guardrails: [],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes.find((c) => c[1] === 'create')).toContain('[guardrail] pii-in-logs');
  });

  it('does not comment again when the reviewer re-posts a tag on the same PR', () => {
    const event = { action: 'created', comment: comment(10, '[mistake:skip-test]', 'claude[bot]', 'NONE', 3) };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [pr(3, ['cause:skip-test']), pr(4, ['cause:skip-test'])],
      comments: [comment(9, '[mistake:skip-test]', 'claude[bot]', 'NONE', 3), comment(10, '[mistake:skip-test]', 'claude[bot]', 'NONE', 3)],
      guardrails: [{ number: 21, title: '[guardrail] skip-test', state: 'open' }],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes).toEqual([]);
  });

  // The real closed-PR list was 1.07 MB (2026-11-16), over execFileSync's 1 MiB default buffer.
  it('handles list output over 1 MiB', () => {
    const filler = Array.from({ length: 400 }, (_, i) => ({ ...pr(100 + i, []), padding: 'x'.repeat(4000) }));
    const event = { action: 'closed', pull_request: pr(5, ['cause:skip-test']) };
    const r = run(event, 'pull_request_target', { pulls: [...filler, pr(3, ['cause:skip-test'])], comments: [], guardrails: [] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes.find((c) => c[1] === 'create')).toContain('[guardrail] skip-test');
  });

  // A review-comment payload also carries pull_request: that PR's own cause: label must still count.
  it('does not comment when a review tag repeats the commented PR\'s own cause label', () => {
    const event = { action: 'created', comment: comment(12, '[mistake:skip-test]', 'claude[bot]', 'NONE', 10), pull_request: pr(10, ['cause:skip-test']) };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [pr(10, ['cause:skip-test']), pr(11, ['cause:skip-test'])],
      comments: [comment(12, '[mistake:skip-test]', 'claude[bot]', 'NONE', 10)],
      guardrails: [{ number: 21, title: '[guardrail] skip-test', state: 'open' }],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes).toEqual([]);
  });

  it('does not count tags from untrusted commenters or unknown categories', () => {
    const event = { action: 'created', comment: comment(9, '[mistake:skip-test]', 'stranger', 'NONE') };
    const r = run(event, 'pull_request_review_comment', {
      pulls: [pr(3, ['cause:skip-test', 'cause:made-up']), pr(4, ['cause:made-up'])],
      comments: [comment(9, '[mistake:skip-test]', 'stranger', 'NONE')],
      guardrails: [],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes).toEqual([]);
  });

  it('ignores merged PRs that are not merged and events with no tag', () => {
    const r = run({ action: 'closed', pull_request: { ...pr(5, ['cause:skip-test']), merged_at: null } }, 'pull_request_target', {
      pulls: [pr(3, ['cause:skip-test'])],
      comments: [],
      guardrails: [],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.writes).toEqual([]);
  });
});
