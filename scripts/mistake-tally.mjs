#!/usr/bin/env node
// 002 US4 (FR-030). Run by mistake-tally.yml on a merged PR or a new review comment. When a category from
// .github/mistake-categories.yml has two or more records and no guardrail issue yet, opens a kind:guardrail issue and dispatches agent-fix
// (an issue made with GITHUB_TOKEN fires no `labeled` event), or comments on the open one.
// REST lists, not search: a just-merged PR can be missing from the search index.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mistakeTags, tallyMistakes } from '../src/core/mistake-tally.ts';

const repo = process.env.GH_REPO;
const gh = (/** @type {string[]} */ ...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
/** @param {string} path @returns {any[]} */
const list = (path) => gh('api', '--paginate', path, '--jq', '.[]').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const yml = readFileSync(new URL('../.github/mistake-categories.yml', import.meta.url), 'utf8');
const categories = new Map([...yml.matchAll(/^- id: (\S+)\n {2}description: (.+)$/gm)].map((m) => [m[1], m[2]]));

// Review tags count only from people who can push or from the review bot: anyone can comment on a public PR.
// One record per PR and category: the reviewer re-posts the same finding on every push.
const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
/** @param {any} c */
const commentRecords = (c) =>
  TRUSTED.includes(c.author_association) || c.user?.login === 'claude[bot]'
    ? mistakeTags(c.body ?? '').map((id) => ({ id, ref: `PR #${c.pull_request_url.split('/').pop()}`, sha: c.commit_id }))
    : [];
/** @param {any} p */
const prRecords = (p) =>
  p.merged_at
    ? p.labels.map((/** @type {{name: string}} */ l) => l.name).filter((/** @type {string} */ n) => n.startsWith('cause:')).map((/** @type {string} */ n) => ({ id: n.slice(6), ref: `PR #${p.number}`, sha: p.merge_commit_sha }))
    : [];

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
/** @type {{id: string, ref: string, sha: string}[]} */
const triggerRecords = event.comment ? commentRecords(event.comment) : event.pull_request ? prRecords(event.pull_request) : [];
// No early exit on an event without records: it still opens a category a cancelled queued run left behind.

// shortcut: lists every closed PR and review comment each run; fine at this repo's size, switch to a stored tally if runs get slow.
// The event's own PR/comment is left out of the lists (it may lag there anyway) and added back once below.
const others = [
  ...list(`repos/${repo}/pulls?state=closed&per_page=100`)
    .filter((p) => p.number !== event.pull_request?.number)
    .flatMap(prRecords),
  ...list(`repos/${repo}/pulls/comments?per_page=100`)
    .filter((c) => c.id !== event.comment?.id)
    .flatMap(commentRecords),
];
// A record is new unless another PR label or comment already gave the same category on the same PR (re-posted tag).
const fresh = triggerRecords.filter((t) => !others.some((r) => r.id === t.id && r.ref === t.ref)).map((t) => t.id);
const records = [...new Map([...others, ...triggerRecords].map((r) => [`${r.id} ${r.ref}`, r])).values()];
// Open and closed: a closed guardrail issue means the guard was made (or ruled out), so nothing reopens it.
const issues = Object.fromEntries(
  list(`repos/${repo}/issues?state=all&labels=kind:guardrail&per_page=100`).flatMap((i) => {
    const id = /^\[guardrail\] (\S+)$/.exec(i.title)?.[1];
    return id ? [[id, { number: i.number, open: i.state === 'open' }]] : [];
  }),
);

for (const a of tallyMistakes({ records, trigger: fresh, categories: [...categories.keys()], issues })) {
  // Body from trusted parts only (id, our description, links, SHAs): it becomes the agent's input.
  const evidence = records
    .filter((r) => r.id === a.id)
    .map((r) => `- ${r.ref} (커밋 \`${r.sha}\`)`)
    .join('\n');
  if (a.action === 'comment') {
    gh('issue', 'comment', String(a.issue), '--body', `같은 실수가 다시 기록됐습니다:\n\n${evidence}`);
    continue;
  }
  const body = `실수 분류 \`${a.id}\`: ${categories.get(a.id)}\n\n두 번째로 기록돼 재발 방지 장치가 필요합니다(헌법 VI, 002 FR-030).\n\n${evidence}\n\n장치 에이전트는 .claude/skills/guardrail/SKILL.md를 따릅니다.`;
  const url = gh('issue', 'create', '--title', `[guardrail] ${a.id}`, '--label', 'kind:guardrail,agent:run', '--body', body);
  gh('workflow', 'run', 'agent-fix.yml', '-f', `issue=${url.split('/').pop()}`);
  console.log(`opened ${url}`);
}
