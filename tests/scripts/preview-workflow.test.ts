import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// T097, research R3, constitution VII: the preview workflows hold the Cloudflare token, so PR code must not get it for free.
const ROOT = join(import.meta.dirname, '../..');
const read = (name: string) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8');

it.each(['preview.yml', 'preview-cleanup.yml'])('%s runs on pull_request (never _target) and skips fix-agent branches', (name) => {
  const wf = read(name);
  expect(wf).toMatch(/^on:\n {2}pull_request:\n/m);
  expect(wf).not.toContain('pull_request_target');
  expect(wf).toContain("if: ${{ !startsWith(github.head_ref, 'agent/') }}");
  expect(wf).toContain('concurrency:\n  group: preview-${{ github.event.pull_request.number }}');
});

it('preview.yml gives the token only to wrangler steps, never to npm ci or the build', () => {
  const steps = read('preview.yml').split(/\n {6}- /).slice(1);
  for (const step of steps) {
    if (!step.includes('secrets.CLOUDFLARE_API_TOKEN }}')) continue;
    if (step.includes('HAS_TOKEN')) continue; // the gate reads only whether it is set
    expect(step, step.slice(0, 80)).toMatch(/wrangler/);
    expect(step).not.toMatch(/npm (ci|run build)/);
  }
  expect(read('preview.yml')).not.toMatch(/^ {4}env:\n(?: {6}.*\n)*? {6}CLOUDFLARE_API_TOKEN/m); // not job-wide
});

it('without the token both workflows skip instead of failing', () => {
  expect(read('preview.yml')).toContain('HAS_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN != \'\' }}');
  expect(read('preview-cleanup.yml')).toContain('if [ -z "$CLOUDFLARE_API_TOKEN" ]; then');
});
