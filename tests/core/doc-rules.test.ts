import { describe, expect, it } from 'vitest';
import { checkDocs, type DocsInput } from '../../src/core/doc-rules.ts';

const CONSTITUTION = `# x

## 문서 구조

| 문서(경로 패턴) | 역할 | 길이 상한 |
|---|---|---|
| \`.specify/memory/constitution.md\` | 원칙 | 20줄 |
| \`specs/*/spec.md\` | 요구사항 | 5줄 |
| \`specs/*/contracts/*.yaml\` | 계약 | 없음 |
| \`specs/*/**/*.md\` | 설계 | 파일당 6줄 |
| \`docs/precedents/README.md\` | 목록 | 없음 |
| \`docs/precedents/*.md\` | 판례 | 파일당 40줄 |

## Governance
`;

const precedent = (extra = '') => `# 제목

- 날짜: 2026-11-06
- 대상: 헌법
- 출처: PR #1
- 대체한 판례: 없음

## 결정

결정.

## 이유

이유.

## 검토한 대안

대안.
${extra}`;

const P1 = 'docs/precedents/2026-11-06-one.md';
const P2 = 'docs/precedents/2026-11-07-two.md';
const README = (...names: string[]) =>
  `# 판례 목록\n\n| 파일 | 제목 | 상태 |\n|---|---|---|\n${names.map((n) => `| [${n}](${n}.md) | t | 유효 |`).join('\n')}\n`;

function base(): DocsInput {
  const files = new Map<string, string>([
    ['.specify/memory/constitution.md', CONSTITUTION],
    ['specs/001-a/spec.md', '# spec\n'],
    ['specs/001-a/plan.md', '# plan\n'],
    [P1, precedent()],
    ['docs/precedents/README.md', README('2026-11-06-one')],
  ]);
  return { changes: [], head: files, base: new Map(files), labels: [] };
}

const rules = (input: DocsInput) => checkDocs(input).map((v) => v.rule);

describe('checkDocs', () => {
  it('passes a clean repository', () => {
    expect(checkDocs(base())).toEqual([]);
  });

  describe('D1 precedent required', () => {
    it('fails when spec changes without a new precedent', () => {
      const i = base();
      i.head.set('specs/001-a/spec.md', '# spec\nmore\n');
      i.changes = [{ status: 'M', path: 'specs/001-a/spec.md' }];
      const v = checkDocs(i);
      expect(v.map((x) => x.rule)).toEqual(['D1']);
      expect(v[0].message).toContain('docs/precedents/YYYY-MM-DD-<slug>.md');
      expect(v[0].message).toContain('no-precedent');
    });

    it('fails for constitution and plan changes too', () => {
      for (const path of ['.specify/memory/constitution.md', 'specs/001-a/plan.md']) {
        const i = base();
        i.changes = [{ status: 'M', path }];
        expect(rules(i)).toContain('D1');
      }
    });

    it('passes when a new precedent is added', () => {
      const i = base();
      i.changes = [
        { status: 'M', path: 'specs/001-a/spec.md' },
        { status: 'A', path: P2 },
        { status: 'M', path: 'docs/precedents/README.md' },
      ];
      i.head.set(P2, precedent());
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', '2026-11-07-two'));
      expect(checkDocs(i)).toEqual([]);
    });

    it('is skipped with the no-precedent label', () => {
      const i = base();
      i.changes = [{ status: 'M', path: 'specs/001-a/spec.md' }];
      i.labels = ['no-precedent'];
      expect(checkDocs(i)).toEqual([]);
    });

    it('ignores other spec documents', () => {
      const i = base();
      i.head.set('specs/001-a/tasks.md', '# tasks\n');
      i.changes = [{ status: 'A', path: 'specs/001-a/tasks.md' }];
      expect(checkDocs(i)).toEqual([]);
    });
  });

  describe('D2 merged precedents are immutable', () => {
    it('allows appending one superseded-by line', () => {
      const i = base();
      i.head.set(P1, `${precedent()}\n대체됨: 2026-11-07-two.md\n`);
      i.changes = [{ status: 'M', path: P1 }];
      expect(checkDocs(i)).toEqual([]);
    });

    it('rejects edits to the body', () => {
      const i = base();
      i.head.set(P1, precedent().replace('결정.', '바뀐 결정.'));
      i.changes = [{ status: 'M', path: P1 }];
      const v = checkDocs(i);
      expect(v.map((x) => x.rule)).toEqual(['D2']);
      expect(v[0].message).toContain('대체됨');
    });

    it('rejects appending anything else', () => {
      const i = base();
      i.head.set(P1, `${precedent()}\n추가 설명\n`);
      i.changes = [{ status: 'M', path: P1 }];
      expect(rules(i)).toEqual(['D2']);
    });

    it('rejects deleting a merged precedent', () => {
      const i = base();
      i.head.delete(P1);
      i.head.set('docs/precedents/README.md', README());
      i.changes = [
        { status: 'D', path: P1 },
        { status: 'M', path: 'docs/precedents/README.md' },
      ];
      expect(rules(i)).toEqual(['D2']);
    });
  });

  describe('D3 precedent format', () => {
    it('rejects a bad file name', () => {
      const i = base();
      const bad = 'docs/precedents/one.md';
      i.head.set(bad, precedent());
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', 'one'));
      expect(rules(i)).toEqual(['D3']);
    });

    it('names missing fields', () => {
      const i = base();
      i.head.set(P2, precedent().replace('- 출처: PR #1\n', '').replace('## 이유', '## 근거'));
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', '2026-11-07-two'));
      const v = checkDocs(i);
      expect(v.map((x) => x.rule)).toEqual(['D3']);
      expect(v[0].message).toContain('출처');
      expect(v[0].message).toContain('이유');
    });

    it('rejects more than 40 lines', () => {
      const i = base();
      i.head.set(P2, precedent('x\n'.repeat(30)));
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', '2026-11-07-two'));
      expect(rules(i)).toContain('D3');
    });
  });

  describe('D4 precedent index', () => {
    it('reports a file missing from the index', () => {
      const i = base();
      i.head.set(P2, precedent());
      const v = checkDocs(i);
      expect(v.map((x) => x.rule)).toEqual(['D4']);
      expect(v[0].message).toContain('2026-11-07-two.md');
    });

    it('reports an index row without a file', () => {
      const i = base();
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', '2026-11-08-ghost'));
      expect(rules(i)).toEqual(['D4']);
    });
  });

  describe('D5 length limits from the constitution table', () => {
    it('applies the first matching row', () => {
      const i = base();
      i.head.set('specs/001-a/spec.md', 'l\n'.repeat(6));
      i.head.set('specs/001-a/plan.md', 'l\n'.repeat(6));
      i.head.set('specs/001-a/contracts/api.yaml', 'l\n'.repeat(500));
      i.head.set('specs/001-a/contracts/screens.md', 'l\n'.repeat(7));
      const v = checkDocs(i).filter((x) => x.rule === 'D5');
      expect(v.map((x) => x.path).sort()).toEqual(['specs/001-a/contracts/screens.md', 'specs/001-a/spec.md']);
      expect(v.find((x) => x.path === 'specs/001-a/spec.md')!.message).toMatch(/6줄.*5줄/);
    });

    it('does not cap the precedent index', () => {
      const names = Array.from({ length: 60 }, (_, n) => `2026-11-06-p${n}`);
      const i = base();
      for (const n of names) i.head.set(`docs/precedents/${n}.md`, precedent());
      i.head.set('docs/precedents/README.md', README('2026-11-06-one', ...names));
      expect(checkDocs(i)).toEqual([]);
    });
  });

  describe('D6 no Clarifications section in specs', () => {
    it('rejects a Clarifications heading', () => {
      const i = base();
      i.head.set('specs/001-a/spec.md', '# s\n## Clarifications\n');
      const v = checkDocs(i);
      expect(v.map((x) => x.rule)).toEqual(['D6']);
      expect(v[0].message).toContain('판례');
    });
  });
});
