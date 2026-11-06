import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');

it('.github/labels.json matches the label table in contracts/github.md', () => {
  const contract = readFileSync(join(ROOT, 'specs/002-auto-bugfix-loop/contracts/github.md'), 'utf8');
  const table = contract.slice(contract.indexOf('## 라벨'), contract.indexOf('에이전트 실행 조건'));
  const documented = new Set(
    table
      .split('\n')
      .filter((l) => l.startsWith('| `'))
      .flatMap((l) => [...l.split('|')[1].matchAll(/`([^`<]+)`/g)].map((m) => m[1])),
  );
  const configured = new Set((JSON.parse(readFileSync(join(ROOT, '.github/labels.json'), 'utf8')) as { name: string }[]).map((l) => l.name));
  expect([...configured].sort()).toEqual([...documented].sort());
});
