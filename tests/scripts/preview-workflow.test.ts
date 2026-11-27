import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// T097, research R3, constitution VII: the preview workflows hold the Cloudflare token, so PR code must not get it for free.
const ROOT = join(import.meta.dirname, '../..');
const read = (name: string) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8');

// Precedent 2026-11-27-operator-delegation: no approval, so the guard must be where PR code cannot reach. pull_request_target runs
// main's definition under the base ref, which the preview environment's main-only branch rule admits; a workflow a PR adds runs
// under refs/pull/N/merge and is refused. The trusted `if` picks the session branches (the ruleset keeps claude/* the operator's).
it.each(['preview.yml', 'preview-cleanup.yml'])('%s runs main\'s definition (pull_request_target) for this repo\'s claude/ branches only', (name) => {
  const wf = read(name);
  expect(wf).toMatch(/^on:\n {2}pull_request_target:\n/m);
  expect(wf).not.toMatch(/^ {2}pull_request:$/m);
  expect(wf).toContain("if: ${{ startsWith(github.head_ref, 'claude/') && github.event.pull_request.head.repo.full_name == github.repository }}");
  expect(wf).toContain('concurrency:\n  group: preview-${{ github.event.pull_request.number }}');
});

it('preview.yml builds the PR head, without leaving the token in git config or saving an npm cache main\'s deploy restores', () => {
  expect(read('preview.yml')).not.toContain('cache: npm');
  expect(read('preview.yml')).toContain('uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n          persist-credentials: false');
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
  // The secrets live only in the preview environment, which admits main's definition (pull_request_target) and refuses a
  // workflow a PR adds (main-only branch rule, precedent 2026-11-27-operator-delegation).
  expect(read(name)).toMatch(/^ {4}environment: preview$/m);
});

it('previews count their own rate limits, not production\'s (PR #43 review)', () => {
  expect(read('preview.yml')).toContain('for (const r of c.ratelimits) r.namespace_id = String(Number(r.namespace_id) + 1000);');
});

it('a missing preview secret or D1 id stops with an error that names it (PR #43 review)', () => {
  const wf = read('preview.yml');
  for (const k of ['TURNSTILE_SITEKEY가 없습니다', '$k가 없습니다', 'D1 $NAME의 id를 찾지 못했습니다']) expect(wf).toContain(k);
});
