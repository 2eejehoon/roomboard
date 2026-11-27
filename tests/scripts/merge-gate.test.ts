import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/merge-gate.mjs');
let repo: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (path: string, content = 'x\n') => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};
const commit = () => {
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c');
  return git('rev-parse', 'HEAD');
};
const run = (base: string, headRef = 'claude/x') =>
  spawnSync('node', [SCRIPT, '--base', base, '--head-ref', headRef], { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'merge-gate-'));
  git('init', '-q');
  write('CLAUDE.md', 'rules\nline 2\nline 3\nline 4\n');
  write('src/client/a.ts');
});

describe('scripts/merge-gate.mjs (FR-066)', () => {
  it('passes a session PR that touches only ordinary files', () => {
    const base = commit();
    write('src/client/a.ts', 'y\n');
    write('tests/core/x.test.ts');
    write('docs/precedents/x.md');
    commit();
    expect(run(base).status).toBe(0);
  });

  it('fails a fix-agent branch', () => {
    const base = commit();
    write('src/client/a.ts', 'y\n');
    commit();
    expect(run(base, 'agent/issue-9-fix').status).toBe(1);
  });

  // Precedent 2026-11-27-operator-delegation: a session PR may change rules, workflows, scripts and config too.
  it.each([
    '.specify/memory/constitution.md',
    'CLAUDE.md',
    '.claude/skills/pr-review/SKILL.md',
    '.github/workflows/ci.yml',
    'scripts/merge-gate.mjs',
    'src/core/agent-gate.ts',
    'package.json',
    'eslint.config.js',
    'wrangler.jsonc',
    'new-root-file.mjs',
  ])('passes a session PR that changes %s', (path) => {
    const base = commit();
    write(path, 'changed\n');
    commit();
    expect(run(base).status).toBe(0);
  });
});
