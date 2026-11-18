#!/usr/bin/env node
// T038, research R5, FR-015: run in agent-fix.yml after the gate and before anything spends a model call or an attempt.
// A client issue's stack must resolve with the deployed build's public source maps (PROD_ORIGIN), or the agent does not run.
// Writes run=<bool> to $GITHUB_OUTPUT and, when resolved, .agent/stack.md for the agent. The issue body is untrusted:
// only plain chunk names listed in the deployed manifest are fetched (src/core/resolve-stack.ts).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SourceMap } from 'node:module';
import { clientFrames, resolvedStack } from '../src/core/resolve-stack.ts';

const issue = process.env.ISSUE ?? '';
const origin = process.env.PROD_ORIGIN ?? '';
const MAX_BYTES = 20_000_000;
const output = (/** @type {boolean} */ run) => appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/null', `run=${run}\n`);

/**
 * JSON from the production site, or undefined (the SPA fallback answers a missing file with index.html and 200).
 * An outage throws instead: the step fails and the issue keeps its labels, so a real issue is not dropped (PR #79 review).
 * @param {string} path
 * @returns {Promise<any>}
 */
async function getJson(path) {
  const res = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(30_000) });
  if (res.status >= 500) throw new Error(`${path}: ${res.status}`);
  const text = await res.text();
  if (!res.ok || text.length > MAX_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** @param {import('../src/core/fingerprint.ts').Frame[]} frames */
async function resolve(frames) {
  const manifest = await getJson('/manifest.json');
  if (typeof manifest?.version !== 'string' || !Array.isArray(manifest.chunks)) return undefined;
  /** @type {Map<string, SourceMap>} */
  const maps = new Map();
  for (const file of new Set(frames.map((f) => f.file))) {
    if (!manifest.chunks.includes(file)) return undefined; // not the deployed build (FR-015)
    const map = await getJson(`/assets/${file}.map`);
    if (map?.version !== 3 || typeof map.mappings !== 'string') return undefined;
    maps.set(file, new SourceMap(map));
  }
  return resolvedStack(frames, manifest.version, (file, line, col) => {
    const e = maps.get(file)?.findEntry(line, col);
    return e && 'originalSource' in e ? { source: e.originalSource, line: e.originalLine, col: e.originalColumn } : undefined;
  });
}

const { body } = JSON.parse(execFileSync('gh', ['issue', 'view', issue, '--json', 'body'], { encoding: 'utf8' }));
const frames = clientFrames(body ?? '');
if (!frames) {
  output(true);
} else {
  const text = frames.length ? await resolve(frames) : undefined;
  if (text) {
    mkdirSync('.agent', { recursive: true });
    writeFileSync('.agent/stack.md', `${text}\n`);
    console.log(text);
    output(true);
  } else {
    // Off the queue too, or agent-queue would bring it back every hour.
    execFileSync('gh', ['issue', 'edit', issue, '--remove-label', 'agent:queued']);
    execFileSync('gh', ['issue', 'comment', issue, '--body', '소스 위치 해석 실패: 스택이 현재 배포된 빌드의 소스맵으로 해석되지 않아 에이전트를 실행하지 않았습니다(FR-015).']);
    output(false);
  }
}
