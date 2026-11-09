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
    write('scripts/seed-sql.ts');
    commit();
    expect(run(base).status).toBe(0);
  });

  it('fails a fix-agent branch', () => {
    const base = commit();
    write('src/client/a.ts', 'y\n');
    commit();
    expect(run(base, 'agent/issue-9-fix').status).toBe(1);
  });

  it.each([
    '.specify/memory/constitution.md',
    'CLAUDE.md',
    '.claude/skills/pr-review/SKILL.md',
    '.github/workflows/ci.yml',
    'scripts/test-first-check.mjs',
    'scripts/merge-gate.mjs',
    'scripts/check-bundle.mjs',
    'src/core/doc-rules.ts',
    'package.json',
    'package-lock.json',
    'vitest.config.ts',
    'eslint.config.js',
    'tsconfig.app.json',
  ])('fails when %s changes', (path) => {
    const base = commit();
    write(path, 'changed\n');
    commit();
    const r = run(base);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(path);
  });

  it('reads the given --head, not the checkout (pull_request_target runs on the base)', () => {
    const base = commit();
    write('CLAUDE.md', 'changed\n');
    const head = commit();
    git('checkout', '-q', base);
    expect(spawnSync('node', [SCRIPT, '--base', base, '--head', head, '--head-ref', 'claude/x'], { cwd: repo, encoding: 'utf8' }).status).toBe(1);
  });

  it('fails when a protected file is renamed away', () => {
    const base = commit();
    git('mv', 'CLAUDE.md', 'docs-old.md');
    commit();
    const r = run(base);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('CLAUDE.md');
  });
});
