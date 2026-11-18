import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

// T038, research R5: the cost-free step in agent-fix.yml before the agent. A client issue whose stack does not resolve
// with the deployed build's source maps gets a comment and no agent run (FR-015).
const SCRIPT = join(import.meta.dirname, '../../scripts/resolve-stack.mjs');
const CHUNK = 'index-CJU4p3Il.js';
// Generated line 0 col 0 → src/client/bug/collector.ts line 69 col 0 (0-based).
const MAP = { version: 3, sources: ['../../../src/client/bug/collector.ts'], names: [], mappings: 'AAqEA' };
const served: Record<string, { type: string; body: string }> = {
  '/manifest.json': { type: 'application/json', body: JSON.stringify({ version: '202611180000-1a2b3c4', chunks: [CHUNK, 'Scene-DC_5v1GI.js'] }) },
  [`/assets/${CHUNK}.map`]: { type: 'application/json', body: JSON.stringify(MAP) },
};
let server: Server;
let origin: string;
beforeAll(async () => {
  // Like the production assets binding (single-page-application): any other path is index.html with 200.
  server = createServer((req, res) => {
    const hit = served[req.url ?? ''] ?? { type: 'text/html', body: '<!doctype html>' };
    res.writeHead(200, { 'content-type': hit.type }).end(hit.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

const issue = (source: string, stack: string[]) => ['| 항목 | 값 |', '|---|---|', `| 출처 | ${source} |`, '', '### 스택 (앱 코드)', ...stack].join('\n');
const frame = (file: string) => `- \`${file}\` \`installCollector\` 1:1`;

async function run(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-stack-'));
  writeFileSync(join(dir, 'body.json'), JSON.stringify({ body }));
  // Fake gh: logs every call, answers `issue view` with the body.
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho "$*" >> "${dir}/gh.log"\n[ "$1 $2" = "issue view" ] && cat "${dir}/body.json"\nexit 0\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  writeFileSync(join(dir, 'out'), '');
  const code = await new Promise<number | null>((resolve) =>
    spawn('node', [SCRIPT], {
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ISSUE: '9', PROD_ORIGIN: origin, GITHUB_OUTPUT: join(dir, 'out') },
      stdio: 'inherit',
    }).on('close', resolve),
  );
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  return { code, out: read('out'), gh: read('gh.log'), stack: read('.agent/stack.md') };
}

it('a server or other issue runs without resolving', async () => {
  const r = await run(issue('server', [frame('index.js')]));
  expect(r.out).toBe('run=true\n');
  expect(r.gh).not.toContain('comment');
  expect(r.stack).toBe('');
});

it('a client issue that resolves runs, with the source lines for the agent', async () => {
  const r = await run(issue('client', [frame(CHUNK)]));
  expect(r.code).toBe(0);
  expect(r.out).toBe('run=true\n');
  expect(r.stack).toContain('- `src/client/bug/collector.ts:70:1` `installCollector`');
  expect(r.stack).toContain('커밋 `1a2b3c4`');
  expect(r.gh).not.toContain('comment');
});

it.each([
  ['a chunk that is not in the deployed build', 'index-OLD00000.js'],
  ['a deployed chunk whose map is missing (the SPA answers index.html)', 'Scene-DC_5v1GI.js'],
  ['a file name that is not a chunk name', '..%2Fmanifest.json'],
])('%s: no agent run, a comment, off the queue', async (_, file) => {
  const r = await run(issue('client', [frame(CHUNK), frame(file)]));
  expect(r.code).toBe(0);
  expect(r.out).toBe('run=false\n');
  expect(r.gh).toContain('issue comment 9 --body 소스 위치 해석 실패');
  expect(r.gh).toContain('issue edit 9 --remove-label agent:queued');
  expect(r.stack).toBe('');
});
