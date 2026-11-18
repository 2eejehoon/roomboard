// T038, research R5: the cost-free step before the fix agent runs on a client issue. The issue's stack is resolved with the
// deployed build's source maps (scripts/resolve-stack.mjs fetches them); a stack that does not resolve runs no agent (FR-015).
import type { Frame } from './fingerprint.ts';

// One stack line as github-sync.ts renders it: - `<file>` `<fn>` <line>:<col>
const LINE = /^- `([^`]*)` `([^`]*)` (\d+):(\d+)$/gm;
// A plain chunk name: the script puts it into a URL on the production origin, so no path, query or host can get through.
const CHUNK = /^[A-Za-z0-9_-]+\.js$/;
const VERSION = /^\d{12}-([0-9a-f]{7,12})$/;

/** Frames of a client issue; empty when any frame is unusable (resolve fails); undefined for any other issue (no resolving). */
export function clientFrames(issueBody: string): Frame[] | undefined {
  if (!/^\| 출처 \| client \|$/m.test(issueBody)) return undefined;
  const frames = [...issueBody.matchAll(LINE)].map(([, file, fn, line, col]) => ({ file: file!, fn: fn!, line: Number(line), col: Number(col) }));
  return frames.every((f) => CHUNK.test(f.file)) ? frames : [];
}

/** A source map lookup with 0-based line and column, as source maps count (stack traces count from 1). */
export type Lookup = (file: string, line: number, col: number) => { source: string; line: number; col: number } | undefined;

/** Markdown for the agent, or undefined when the stack does not resolve: every frame must land in this repo's src/. */
export function resolvedStack(frames: Frame[], version: string, lookup: Lookup): string | undefined {
  const sha = VERSION.exec(version)?.[1];
  if (!sha || frames.length === 0) return undefined;
  const lines: string[] = [];
  for (const f of frames) {
    const hit = lookup(f.file, f.line - 1, f.col - 1);
    const path = hit?.source.replace(/^(\.\.?\/)+/, '');
    if (!hit || !path?.startsWith('src/')) return undefined;
    lines.push(`- \`${path}:${hit.line + 1}:${hit.col + 1}\` \`${f.fn}\` (\`${f.file}\` ${f.line}:${f.col})`);
  }
  return [`### 소스 위치 (배포 빌드 ${version}, 커밋 \`${sha}\`, 소스맵 해석)`, '', ...lines].join('\n');
}
