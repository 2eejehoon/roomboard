#!/usr/bin/env node
// 002 US6 pre-check (no LLM): agent docs that mention missing paths or npm scripts, or sit at 90%+ of their length limit.
// Run from the repository root. Prints one finding per line; exit 1 if any, 0 if nothing to tidy.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lineCount, parseLimits } from '../src/core/doc-rules.ts';

/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
      })
    : [];
// Precedents are immutable and may name deleted files; speckit-* skills are vendored by `specify init`.
const docs = ['CLAUDE.md', ...walk('.claude/skills'), ...walk('docs')].filter(
  (p) => existsSync(p) && !p.startsWith('docs/precedents/') && !p.startsWith('.claude/skills/speckit-'),
);
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {};
const limits = parseLimits(existsSync('.specify/memory/constitution.md') ? readFileSync('.specify/memory/constitution.md', 'utf8') : '');

const out = [];
for (const doc of docs) {
  const text = readFileSync(doc, 'utf8');
  for (const [, token] of text.matchAll(/`([^`\s]+)`/g)) {
    const path = token.replace(/:\d+$/, '');
    // shortcut: a path counts only if its first segment is an existing root directory (skips branch names, runtime dirs); misses typos in that segment.
    const top = path.split('/')[0];
    if (path.includes('/') && !/[*<>{}]/.test(path) && top && existsSync(top) && statSync(top).isDirectory() && !existsSync(path)) {
      out.push(`${doc}: 없는 경로 \`${path}\``);
    }
  }
  for (const [, cmd, name] of text.matchAll(/`npm (run (\S+?)|test)[`\s]/g)) {
    if (!((name ?? 'test') in scripts)) out.push(`${doc}: package.json에 없는 스크립트 \`npm ${cmd}\``);
  }
  const max = limits.find((l) => l.pattern.test(doc))?.max;
  const n = lineCount(text);
  if (max && n >= max * 0.9) out.push(`${doc}: ${n}줄, 상한 ${max}줄의 90% 이상`);
}
for (const line of out) console.log(line);
process.exit(out.length ? 1 : 0);
