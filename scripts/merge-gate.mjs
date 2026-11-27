#!/usr/bin/env node
// Usage: node scripts/merge-gate.mjs --head-ref <branch>
// FR-066: exit 1 on the fix agent's PRs (agent/ branches): they start from outside input (issues, reports), so a human merges them.
// Every other session PR may auto-merge once the required checks pass (precedent 2026-11-27-operator-delegation).
// Runs from the default branch (merge-gate.yml, pull_request_target), so a PR cannot edit its own gate. The session-branch ruleset
// keeps the agent's pushes inside agent/** (002 quickstart), which is what makes the branch name trustworthy.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, 'head-ref': { type: 'string', default: '' } } });
if (values['head-ref'].startsWith('agent/')) {
  console.log(`수정 에이전트 PR(${values['head-ref']}): 운영자가 머지합니다(FR-066).`);
  process.exit(1);
}
console.log('auto-merge 가능');
