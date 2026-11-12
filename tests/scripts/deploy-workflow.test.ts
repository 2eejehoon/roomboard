import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// T108, research R3, constitution VII: the production deploy holds the Cloudflare token and production secrets.
const wf = () => readFileSync(join(import.meta.dirname, '../../.github/workflows/deploy.yml'), 'utf8');

it('runs only by hand on main, behind the production environment (operator approval)', () => {
  const w = wf();
  expect(w).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
  expect(w).not.toMatch(/^ {2}(push|pull_request|pull_request_target|schedule):/m);
  expect(w).toContain("if: ${{ github.ref == 'refs/heads/main' }}");
  expect(w).toMatch(/^ {4}environment: production$/m);
  expect(w).toContain('concurrency:\n  group: production\n  cancel-in-progress: false');
});

it('deploys the production Worker and D1 with production rate limits', () => {
  const w = wf();
  expect(w).toContain('NAME: roomboard\n');
  expect(w).toContain('c.d1_databases[0].database_id = process.argv[1];');
  expect(w).not.toContain('namespace_id');
  expect(w).not.toContain('c.name =');
});

it('ships no test hooks, and a failed deploy fails the job', () => {
  const w = wf();
  expect(w).toMatch(/npm run build[\s\S]*npm run check:bundle[\s\S]*wrangler deploy/);
  const deploy = w.split(/\n {6}- /).find((s) => s.includes('wrangler deploy'))!;
  expect(deploy).toMatch(/set -o pipefail[\s\S]*wrangler deploy/);
  expect(deploy).toMatch(/\[ -n "\$url" \] \|\| \{ echo "::error::/);
});

it('a missing secret or D1 id stops with an error that names it', () => {
  const w = wf();
  for (const k of ['CLOUDFLARE_API_TOKEN가 없습니다', 'TURNSTILE_SITEKEY가 없습니다', '$k가 없습니다', 'D1 $NAME의 id를 찾지 못했습니다']) expect(w).toContain(k);
});
