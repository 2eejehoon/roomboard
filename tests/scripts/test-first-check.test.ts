import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/test-first-check.mjs');
let repo: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};
const commit = (msg: string) => {
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', msg);
  return git('rev-parse', 'HEAD');
};
const run = (base: string) => spawnSync('node', [SCRIPT, '--base', base, '--head', 'HEAD'], { cwd: repo, encoding: 'utf8' });

const TEST = `import { expect, it } from 'vitest';\nimport { add } from '../src/add.ts';\nit('adds', () => expect(add(1, 2)).toBe(3));\n`;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'test-first-'));
  git('init', '-q');
  symlinkSync(join(ROOT, 'node_modules'), join(repo, 'node_modules'));
  write('.gitignore', 'node_modules\n');
  write('package.json', '{"type":"module"}\n');
  write('src/add.ts', 'export const add = (a: number, b: number) => a - b;\n');
});

describe('scripts/test-first-check.mjs', () => {
  it('passes when the first commit adds a failing test and the head fixes it', () => {
    const base = commit('base');
    write('tests/add.test.ts', TEST);
    commit('test: failing');
    write('src/add.ts', 'export const add = (a: number, b: number) => a + b;\n');
    commit('fix');
    const r = run(base);
    expect(r.stdout + r.stderr).toContain('tests/add.test.ts');
    expect(r.status).toBe(0);
  });

  it('fails when the first commit already contains the fix', () => {
    const base = commit('base');
    write('tests/add.test.ts', TEST);
    write('src/add.ts', 'export const add = (a: number, b: number) => a + b;\n');
    commit('test and fix together');
    const r = run(base);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('실패하지 않았습니다');
  });

  it('fails when the first commit has no test', () => {
    const base = commit('base');
    write('src/add.ts', 'export const add = (a: number, b: number) => a + b;\n');
    commit('fix only');
    const r = run(base);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('테스트');
  });

  it('fails when the test still fails at the head', () => {
    const base = commit('base');
    write('tests/add.test.ts', TEST);
    commit('test: failing');
    write('README.md', 'no fix\n');
    commit('not a fix');
    const r = run(base);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('head');
  });
});
