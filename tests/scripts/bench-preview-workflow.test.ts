import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// 004 T055 (research R1, quickstart 4): the session cannot reach workers.dev, so the preview rerun of real.mjs runs on a GitHub
// runner. It is started by hand on main with a preview URL and a cafe room id made in a browser (the preview has the real Turnstile key).
const ROOT = join(import.meta.dirname, '../..');
const wf = () => readFileSync(join(ROOT, '.github/workflows/bench-preview.yml'), 'utf8');

it('runs only by hand, with the preview URL and room id as inputs, and reads no secrets', () => {
  const w = wf();
  expect(w).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
  expect(w).toMatch(/^ {6}url:\n/m);
  expect(w).toMatch(/^ {6}room:\n/m);
  expect(w).not.toContain('secrets.');
  expect(w).not.toMatch(/^ {4}environment:/m);
  expect(w).toContain('permissions:\n  contents: read');
});

it('inputs reach the shell through env only, and must look like a preview URL and a room id', () => {
  const w = wf();
  // `${{ inputs.x }}` inside run: would let a crafted input run commands.
  for (const run of w.split(/\n\s+run: \|\n/).slice(1)) expect(run).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)\./);
  expect(w).toContain('URL: ${{ inputs.url }}');
  expect(w).toContain('ROOM: ${{ inputs.room }}');
  expect(w).toContain('^https://roomboard-pr-[0-9]+\\.[a-z0-9-]+\\.workers\\.dev$');
  expect(w).toContain('^[A-Za-z0-9_-]{1,64}$');
});

it('measures the whole T055 batch three times, plus two channels of 20 at once', () => {
  const w = wf();
  expect(w).toContain('for run in 1 2 3; do');
  expect(w).toContain('for n in 2 4 8 12 20; do');
  expect(w).toContain('for n in 12 20; do');
  expect(w).toContain('SPREAD=1 node tests/bench/brawl-load/real.mjs "$URL" "$ROOM" 20 20 > "$out/two-a-$run.json" &');
  expect(w).toContain('tests/bench/brawl-load/real.mjs "$URL" "$ROOM"');
  expect(w).toMatch(/uses: actions\/upload-artifact@v4/);
});
