import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/agent-branch-check.mjs');
let work: string;

const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: work, encoding: 'utf8' }).trim();
const check = (issue: string, branch: string) => spawnSync('node', [SCRIPT, issue, branch], { cwd: work, encoding: 'utf8' });

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'branch-check-'));
  execFileSync('git', ['init', '-q', '--bare', join(dir, 'remote.git')]);
  work = join(dir, 'work');
  execFileSync('git', ['clone', '-q', join(dir, 'remote.git'), work]);
  git('commit', '-q', '--allow-empty', '-m', 'base');
  git('push', '-q', 'origin', 'HEAD:refs/heads/main');
});

describe('scripts/agent-branch-check.mjs (which branch the PR token may open a PR from)', () => {
  it('accepts this issue branch pushed by this run', () => {
    git('checkout', '-q', '-b', 'agent/issue-9-fix');
    git('commit', '-q', '--allow-empty', '-m', 'fix');
    git('push', '-q', 'origin', 'agent/issue-9-fix');
    expect(check('9', 'agent/issue-9-fix').status).toBe(0);
  });

  it('rejects another issue branch, a non-agent branch, and a prefix trick', () => {
    for (const b of ['agent/issue-3-x', 'main', 'agent/issue-90-x', 'feature/issue-9-x']) {
      git('checkout', '-q', '-B', b);
      git('push', '-q', 'origin', b);
      const r = check('9', b);
      expect(r.status, b).toBe(1);
    }
  });

  it('rejects a stale remote branch that this run did not push', () => {
    git('push', '-q', 'origin', 'HEAD:refs/heads/agent/issue-9-old');
    git('checkout', '-q', '-b', 'agent/issue-9-old');
    git('commit', '-q', '--allow-empty', '-m', 'local only');
    const r = check('9', 'agent/issue-9-old');
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('push');
  });

  it('rejects a branch that was never pushed', () => {
    git('checkout', '-q', '-b', 'agent/issue-9-local');
    expect(check('9', 'agent/issue-9-local').status).toBe(1);
  });
});
