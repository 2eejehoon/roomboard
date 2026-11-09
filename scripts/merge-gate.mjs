#!/usr/bin/env node
// Usage: node scripts/merge-gate.mjs --base <rev> --head-ref <branch>
// FR-066: exit 1 on PRs a human must merge (fix-agent branch, or a change to agent rules, workflows, or a script a
// required check or the agent gate runs, with its imports). The check fails there, so only the admin bypass merges.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const PROTECTED = [
  /^\.specify\/memory\/constitution\.md$/,
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^\.github\//,
  /^scripts\/(agent-gate|agent-branch-check|test-first-check|check-docs|merge-gate)\.mjs$/,
  /^src\/core\/(agent-gate|doc-rules)\.ts$/,
];

const { values } = parseArgs({ options: { base: { type: 'string' }, 'head-ref': { type: 'string', default: '' } } });
if (!values.base) {
  console.error('usage: merge-gate --base <rev> --head-ref <branch>');
  process.exit(2);
}
if (values['head-ref'].startsWith('agent/')) {
  console.log(`수정 에이전트 PR(${values['head-ref']}): 운영자가 머지합니다(FR-066).`);
  process.exit(1);
}
// --no-renames: with rename detection a moved file lists only its new path.
const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', `${values.base}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const hits = paths.filter((p) => PROTECTED.some((re) => re.test(p)));
if (hits.length) {
  console.log(`사람이 머지할 경로를 바꿨습니다(FR-066). 운영자가 머지합니다:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('auto-merge 가능');
