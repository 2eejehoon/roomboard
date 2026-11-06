import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The check runs on a fresh runner (no agent workspace): it compares the branch SHA recorded before the agent ran
// with the SHA after, both read from the GitHub API by the workflow.
const SCRIPT = join(import.meta.dirname, '../../scripts/agent-branch-check.mjs');
const check = (...args: string[]) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

describe('scripts/agent-branch-check.mjs <issue> <branch> <sha-before> <sha-after>', () => {
  it('accepts a new branch for this issue', () => {
    expect(check('9', 'agent/issue-9-fix', '', 'a'.repeat(40)).status).toBe(0);
  });

  it('accepts an existing branch for this issue that this run moved', () => {
    expect(check('9', 'agent/issue-9-fix', 'b'.repeat(40), 'a'.repeat(40)).status).toBe(0);
  });

  it('rejects another issue branch, a non-agent branch, and a prefix trick', () => {
    for (const b of ['agent/issue-3-x', 'main', 'agent/issue-90-x', 'feature/issue-9-x']) {
      expect(check('9', b, '', 'a'.repeat(40)).status, b).toBe(1);
    }
  });

  it('rejects a stale branch this run did not push (same SHA as before)', () => {
    const r = check('9', 'agent/issue-9-old', 'c'.repeat(40), 'c'.repeat(40));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('push');
  });

  it('rejects a branch that does not exist on GitHub', () => {
    expect(check('9', 'agent/issue-9-none', '', '').status).toBe(1);
  });

  it('rejects malformed input', () => {
    expect(check('9x', 'agent/issue-9x-a', '', 'a'.repeat(40)).status).toBe(1);
    expect(check('9', 'agent/issue-9-a', '', 'not-a-sha').status).toBe(1);
  });
});
