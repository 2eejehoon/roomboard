import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// T097, research R3, constitution VII: the preview workflows hold the Cloudflare token, so PR code must not get it for free.
const ROOT = join(import.meta.dirname, '../..');
const read = (name: string) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8');

it.each(['preview.yml', 'preview-cleanup.yml'])('%s runs on pull_request (never _target) and skips what the environment rule would refuse', (name) => {
  const wf = read(name);
  expect(wf).toMatch(/^on:\n {2}pull_request:\n/m);
  expect(wf).not.toContain('pull_request_target');
  // Same branches as the preview environment's rule, and no forks: those would otherwise end red, not skipped (PR #43 review).
  expect(wf).toContain("if: ${{ startsWith(github.head_ref, 'claude/') && github.event.pull_request.head.repo.full_name == github.repository }}");
  expect(wf).toContain('concurrency:\n  group: preview-${{ github.event.pull_request.number }}');
});

it('without the token both workflows skip instead of failing', () => {
  expect(read('preview.yml')).toContain('HAS_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN != \'\' }}');
  expect(read('preview-cleanup.yml')).toContain('if [ -z "$CLOUDFLARE_API_TOKEN" ]; then');
});

it('a failed deploy fails the job: pipefail before the tee, and no URL is an error (PR #43 review)', () => {
  const deploy = read('preview.yml').split(/\n {6}- /).find((s) => s.includes('wrangler deploy'))!;
  expect(deploy).toMatch(/set -o pipefail[\s\S]*wrangler deploy/);
  expect(deploy).toMatch(/\[ -n "\$url" \] \|\| \{ echo "::error::/);
});

it.each(['preview.yml', 'preview-cleanup.yml'])('%s reads its secrets from the preview environment (PR #43 review)', (name) => {
  // The workflow file comes from the PR, so only the preview environment's required reviewer (Settings) keeps the secrets
  // from PR code; the job `if` only skips other branches (precedents 2026-11-10-preview-environment, 2026-11-10-preview-no-branch-rule).
  expect(read(name)).toMatch(/^ {4}environment: preview$/m);
});

it('previews count their own rate limits, not production\'s (PR #43 review)', () => {
  expect(read('preview.yml')).toContain('for (const r of c.ratelimits) r.namespace_id = String(Number(r.namespace_id) + 1000);');
});

it('a missing preview secret or D1 id stops with an error that names it (PR #43 review)', () => {
  const wf = read('preview.yml');
  for (const k of ['TURNSTILE_SITEKEY가 없습니다', '$k가 없습니다', 'D1 $NAME의 id를 찾지 못했습니다']) expect(wf).toContain(k);
});
