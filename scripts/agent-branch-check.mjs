#!/usr/bin/env node
// Usage: node scripts/agent-branch-check.mjs <issue> <branch>
// Exit 0 only if <branch> is agent/issue-<issue>-* and the remote branch is exactly this run's local branch.
import { execFileSync } from 'node:child_process';

const [issue, branch] = process.argv.slice(2);
const fail = (/** @type {string} */ msg) => {
  console.log(`agent-branch-check: ${msg}`);
  process.exit(1);
};
if (!/^\d+$/.test(issue ?? '') || !branch?.startsWith(`agent/issue-${issue}-`)) fail(`${branch} is not agent/issue-${issue}-*`);

const git = (/** @type {string[]} */ ...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const remote = git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`).split('\t')[0];
const local = git('rev-parse', '--verify', '-q', `refs/heads/${branch}`);
if (!remote || remote !== local) fail(`${branch} on origin is not what this run pushed`);
console.log(`agent-branch-check: ok ${branch} ${local.slice(0, 7)}`);
