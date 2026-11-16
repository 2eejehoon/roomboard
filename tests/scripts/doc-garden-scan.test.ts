import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/doc-garden-scan.mjs');
let dir: string;

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const run = () => spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doc-garden-'));
  write('package.json', JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }));
  write('src/core/real.ts', '');
  write('.specify/memory/constitution.md', '## 문서 구조\n\n| 문서 | 역할 | 길이 상한 |\n|---|---|---|\n| `CLAUDE.md` | 규칙 | 10줄 |\n');
});

describe('scripts/doc-garden-scan.mjs', () => {
  it('reports nothing when every mentioned path and npm script exists', () => {
    write('CLAUDE.md', 'Use `src/core/real.ts`, `npm test`, `npm run lint` and `npm ci`. Branch `agent/issue-<n>-x`, glob `src/**`.\n');
    write('.claude/skills/x/SKILL.md', 'See `src/core/real.ts:12`.\n');
    const r = run();
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('reports a missing path and a missing npm script', () => {
    write('CLAUDE.md', 'Read `src/core/gone.ts`, then `npm run nope`.\n');
    const r = run();
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('CLAUDE.md');
    expect(r.stdout).toContain('src/core/gone.ts');
    expect(r.stdout).toContain('npm run nope');
  });

  it('scans skills and docs, but not precedents or vendored speckit skills', () => {
    write('.claude/skills/guardrail/SKILL.md', '`src/core/gone-a.ts`\n');
    write('docs/notes.md', '`src/core/gone-b.ts`\n');
    write('docs/precedents/2026-01-01-x.md', '`src/core/gone-c.ts`\n');
    write('.claude/skills/speckit-plan/SKILL.md', '`src/core/gone-d.ts`\n');
    const r = run();
    expect(r.stdout).toContain('gone-a');
    expect(r.stdout).toContain('gone-b');
    expect(r.stdout).not.toContain('gone-c');
    expect(r.stdout).not.toContain('gone-d');
  });

  it('reports a document at 90% or more of its length limit', () => {
    write('CLAUDE.md', `${lines(9)}\n`);
    const r = run();
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/CLAUDE\.md.*9.*10/);
  });
});
