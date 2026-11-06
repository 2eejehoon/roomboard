#!/usr/bin/env node
// Usage: node scripts/agent-branch-check.mjs <issue> <branch> <sha-before> <sha-after>
// Exit 0 only if <branch> is agent/issue-<issue>-* and this run moved it: <sha-after> exists and differs from
// <sha-before> (empty when the branch did not exist before the agent ran). Both SHAs come from the GitHub API on a
// fresh runner, never from the agent's working tree.
const [issue, branch, before, after] = process.argv.slice(2);
const fail = (/** @type {string} */ msg) => {
  console.log(`agent-branch-check: ${msg}`);
  process.exit(1);
};
const sha = /^[0-9a-f]{40}$/;
if (!/^\d+$/.test(issue ?? '') || !branch?.startsWith(`agent/issue-${issue}-`)) fail(`${branch} is not agent/issue-${issue}-*`);
if (!sha.test(after ?? '')) fail(`${branch} does not exist on GitHub`);
if (before && !sha.test(before)) fail(`bad sha-before: ${before}`);
if (before === after) fail(`${branch} was not pushed by this run (unchanged since before the agent ran)`);
console.log(`agent-branch-check: ok ${branch} ${after.slice(0, 7)}`);
