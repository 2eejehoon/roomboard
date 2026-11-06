#!/usr/bin/env node
// FR-021: the first commit must add a test that fails there and passes at head.
// Usage: node scripts/test-first-check.mjs --base <rev> [--head <rev>]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' } } });
if (!values.base) {
  console.error('usage: test-first-check --base <rev> [--head <rev>]');
  process.exit(2);
}
const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const root = git('rev-parse', '--show-toplevel');
const vitest = (/** @type {string} */ cwd, /** @type {string[]} */ files) =>
  spawnSync(join(resolve(root, 'node_modules/.bin'), 'vitest'), ['run', ...files], { cwd, encoding: 'utf8' }).status === 0;
const fail = (/** @type {string} */ msg) => {
  console.log(`test-first: ${msg}`);
  process.exit(1);
};

const base = git('merge-base', values.base, values.head);
const first = git('rev-list', '--reverse', '--no-merges', `${base}..${values.head}`).split('\n')[0];
if (!first) fail('PR에 커밋이 없습니다.');
const tests = git('diff-tree', '--no-commit-id', '--name-only', '--diff-filter=AM', '-r', first)
  .split('\n')
  .filter((f) => /^tests\/.*\.test\.ts$/.test(f));
if (!tests.length) fail(`첫 커밋 ${first.slice(0, 7)}에 테스트(tests/**/*.test.ts)가 없습니다. 버그를 재현하는 실패 테스트를 첫 커밋으로 올리세요.`);

const dir = mkdtempSync(join(tmpdir(), 'test-first-'));
try {
  git('worktree', 'add', '--detach', '--quiet', dir, first);
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  if (vitest(dir, tests)) fail(`첫 커밋에서 ${tests.join(', ')}가 실패하지 않았습니다. 수정 전 코드에서 실패하는 테스트여야 합니다.`);
} finally {
  git('worktree', 'remove', '--force', dir);
  rmSync(dir, { recursive: true, force: true });
}
if (!vitest(root, tests)) fail(`head에서 ${tests.join(', ')}가 아직 실패합니다.`);
console.log(`test-first: ok (${tests.join(', ')} fails at ${first.slice(0, 7)}, passes at head)`);
