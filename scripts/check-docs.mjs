#!/usr/bin/env node
// Usage: node scripts/check-docs.mjs --base <rev> --head <rev> [--labels a,b]
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { checkDocs } from '../src/core/doc-rules.ts';

const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string', default: 'HEAD' }, labels: { type: 'string', default: '' } } });
if (!values.base) {
  console.error('usage: check-docs --base <rev> [--head <rev>] [--labels a,b]');
  process.exit(2);
}

const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
/** @param {string} rev */
const readTree = (rev) => {
  const files = new Map();
  for (const path of git('ls-tree', '-r', '--name-only', rev).split('\n')) {
    if (/\.(md|ya?ml)$/.test(path)) files.set(path, git('show', `${rev}:${path}`));
  }
  return files;
};

const mergeBase = git('merge-base', values.base, values.head).trim();
const changes = git('diff', '--name-status', '--no-renames', mergeBase, values.head)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split('\t');
    return { status: /** @type {'A'|'M'|'D'} */ (status[0] === 'A' ? 'A' : status[0] === 'D' ? 'D' : 'M'), path };
  });

const violations = checkDocs({
  changes,
  head: readTree(values.head),
  base: readTree(mergeBase),
  labels: values.labels.split(',').map((l) => l.trim()).filter(Boolean),
});

for (const v of violations) console.log(`${v.rule} ${v.path}\n  ${v.message}`);
process.exit(violations.length ? 1 : 0);
