#!/usr/bin/env node
// Usage: node scripts/merge-gate.mjs --base <rev> [--head <rev>] --head-ref <branch>
// FR-066: exit 1 on PRs a human must merge: the fix-agent branch, or a change to agent rules, workflows, or any file
// that decides what a required check runs. The check fails there, so only the admin bypass merges. Runs from the
// default branch (merge-gate.yml, pull_request_target) and only reads the PR's paths, so a PR cannot edit its own gate.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const PROTECTED = [
  /^\.specify\/memory\/constitution\.md$/,
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^\.github\//,
  /^scripts\/[^/]+\.mjs$/, // every gate script: check-bundle, check-docs, test-first-check, agent-*, merge-gate
  /^src\/core\/(agent-gate|doc-rules)\.ts$/, // imported by agent-gate.mjs, check-docs.mjs
  /^package(-lock)?\.json$/, // npm scripts the ci check calls, and dependencies
  /^[^/]+\.config\.(js|ts)$/, // eslint, vite, vitest, playwright
  /^tsconfig[^/]*\.json$/,
];

const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' }, 'head-ref': { type: 'string', default: '' } } });
if (!values.base) {
  console.error('usage: merge-gate --base <rev> --head-ref <branch>');
  process.exit(2);
}
if (values['head-ref'].startsWith('agent/')) {
  console.log(`수정 에이전트 PR(${values['head-ref']}): 운영자가 머지합니다(FR-066).`);
  process.exit(1);
}
// --no-renames: with rename detection a moved file lists only its new path.
const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', `${values.base}...${values.head}`], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const hits = paths.filter((p) => PROTECTED.some((re) => re.test(p)));
if (hits.length) {
  console.log(`사람이 머지할 경로를 바꿨습니다(FR-066). 운영자가 머지합니다:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('auto-merge 가능');
