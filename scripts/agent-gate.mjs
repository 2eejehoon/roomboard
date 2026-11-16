#!/usr/bin/env node
// Reads the GitHub event and writes run=<bool>, attempt=<n>, issue=<n>, kind, skill to $GITHUB_OUTPUT.
// kind:guardrail (002 US4) and kind:doc-garden (US6) issues run their own skill and their PR carries that label, not cause:.
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { shouldRunAgent } from '../src/core/agent-gate.ts';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
const dispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const issue = dispatch ? Number(event.inputs.issue) : event.issue.number;
// Always read current labels: a run queued behind another carries a stale payload without agent:attempt-1.
const labels = JSON.parse(execFileSync('gh', ['issue', 'view', String(issue), '--json', 'labels'], { encoding: 'utf8' })).labels.map(
  (/** @type {{name: string}} */ l) => l.name,
);

/** @type {Record<string, string>} */
const SKILLS = { 'kind:guardrail': 'guardrail', 'kind:doc-garden': 'doc-gardening' };
const kind = labels.find((/** @type {string} */ l) => l in SKILLS) ?? '';
const skill = SKILLS[kind] ?? 'bugfix';
const result = shouldRunAgent({ action: dispatch ? 'dispatch' : event.action, addedLabel: event.label?.name, labels });
console.log(JSON.stringify({ issue, ...result }));
appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/null', `run=${result.run}\nissue=${issue}\nattempt=${result.run ? result.attempt : 0}\nkind=${kind}\nskill=${skill}\n`);
