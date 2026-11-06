import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/check-docs.mjs');
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
const run = (base: string, labels = '') =>
  spawnSync('node', [SCRIPT, '--base', base, '--head', 'HEAD', '--labels', labels], { cwd: repo, encoding: 'utf8' });

// The real repository docs at HEAD are the fixture: they must already pass.
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'check-docs-'));
  git('init', '-q');
  for (const dir of ['.specify/memory', 'docs/precedents', 'specs']) cpSync(join(ROOT, dir), join(repo, dir), { recursive: true });
});

describe('scripts/check-docs.mjs', () => {
  it('passes on the current repository docs', () => {
    const b = commit('base');
    write('specs/001-realtime-room-board/tasks.md', `${readFileSync(join(repo, 'specs/001-realtime-room-board/tasks.md'), 'utf8')}\n`);
    commit('head');
    const r = run(b);
    expect(r.stderr + r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('B1: fails when spec.md changes without a precedent', () => {
    const b = commit('base');
    const p = 'specs/001-realtime-room-board/spec.md';
    write(p, `${readFileSync(join(repo, p), 'utf8')}\n한 줄\n`);
    commit('head');
    const r = run(b);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('D1');
  });

  it('B2: fails when a merged precedent body is edited', () => {
    const b = commit('base');
    const p = 'docs/precedents/2026-11-06-list-newest.md';
    write(p, readFileSync(join(repo, p), 'utf8').replace('최신순', '인원순'));
    commit('head');
    const r = run(b);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('D2');
  });

  it('B3: fails when the constitution exceeds its cap or a spec has Clarifications', () => {
    const b = commit('base');
    const c = '.specify/memory/constitution.md';
    write(c, `${readFileSync(join(repo, c), 'utf8')}${'\n'.repeat(200)}`);
    const s = 'specs/002-auto-bugfix-loop/spec.md';
    write(s, `${readFileSync(join(repo, s), 'utf8')}\n## Clarifications\n`);
    commit('head');
    const r = run(b, 'no-precedent');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('D5');
    expect(r.stdout).toContain('D6');
  });

  it('B4: passes a typo fix labelled no-precedent', () => {
    const b = commit('base');
    const p = 'specs/001-realtime-room-board/plan.md';
    write(p, readFileSync(join(repo, p), 'utf8').replace('Summary', 'Summary '));
    commit('head');
    expect(run(b, 'no-precedent').status).toBe(0);
    expect(run(b).status).toBe(1);
  });
});
