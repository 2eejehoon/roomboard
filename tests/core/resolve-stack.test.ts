import { describe, expect, it } from 'vitest';
import { clientFrames, resolvedStack, type Lookup } from '../../src/core/resolve-stack.ts';

// T038, research R5: before the fix agent runs on a client issue, its stack is resolved with the deployed build's source maps.
// The issue body is untrusted (constitution VII): only what github-sync.ts writes is read.
const body = (source: string, stack: string[]) =>
  [
    '<!-- roomboard-fingerprint: 3fa2c1d09b7e4a51 -->',
    '| 항목 | 값 |',
    '|---|---|',
    `| 출처 | ${source} |`,
    '',
    '### 스택 (앱 코드)',
    ...stack,
    '',
    '이 이슈는 자동으로 만들어졌다.',
  ].join('\n');
const STACK = ['- `room3d-8f1cAb12.js` `applyPeerMoved` 1:20431', '- `index-BXjaK0XS.js` `onMessage` 1:300'];

describe('clientFrames', () => {
  it('reads the stack lines of a client issue', () => {
    expect(clientFrames(body('client', STACK))).toEqual([
      { file: 'room3d-8f1cAb12.js', fn: 'applyPeerMoved', line: 1, col: 20431 },
      { file: 'index-BXjaK0XS.js', fn: 'onMessage', line: 1, col: 300 },
    ]);
  });

  it('is undefined for a server issue or any other body: those run without resolving', () => {
    expect(clientFrames(body('server', STACK))).toBeUndefined();
    expect(clientFrames('사용자 신고 요약')).toBeUndefined();
  });

  it('a client issue whose stack has no usable frame gives an empty list (resolve fails)', () => {
    expect(clientFrames(body('client', []))).toEqual([]);
  });

  it('a frame whose file is not a plain chunk name fails the whole stack, so no path or URL reaches the fetch', () => {
    for (const file of ['../manifest.json', 'https://evil.example/x.js', 'a/b.js', '[가림].js', 'index.js?x=1'])
      expect(clientFrames(body('client', [STACK[0]!, `- \`${file}\` \`f\` 1:2`]))).toEqual([]);
  });
});

describe('resolvedStack', () => {
  const frames = clientFrames(body('client', STACK))!;
  const seen: unknown[] = [];
  const lookup: Lookup = (file, line, col) => {
    seen.push([file, line, col]);
    return { source: '../../src/client/room/room3d/Avatar.tsx', line: 41, col: 4 };
  };

  it('gives source lines with the deployed commit, asking the map with 0-based positions', () => {
    const text = resolvedStack(frames, '202611130000-1a2b3c4', lookup);
    expect(seen).toEqual([
      ['room3d-8f1cAb12.js', 0, 20430],
      ['index-BXjaK0XS.js', 0, 299],
    ]);
    expect(text).toContain('커밋 `1a2b3c4`');
    expect(text).toContain('- `src/client/room/room3d/Avatar.tsx:42:5` `applyPeerMoved` (`room3d-8f1cAb12.js` 1:20431)');
  });

  it('is undefined when any frame does not map to app source, or there are no frames', () => {
    expect(resolvedStack(frames, '202611130000-1a2b3c4', () => undefined)).toBeUndefined();
    expect(resolvedStack(frames, '202611130000-1a2b3c4', () => ({ source: '../../node_modules/three/build/three.module.js', line: 0, col: 0 }))).toBeUndefined();
    expect(resolvedStack([], '202611130000-1a2b3c4', lookup)).toBeUndefined();
    expect(resolvedStack(frames, 'dev', lookup)).toBeUndefined(); // no commit to read the lines at
  });
});
