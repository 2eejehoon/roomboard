import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// T055 (research R1): the real-server load script run from a GitHub runner, outside a session's agent proxy.
const wf = () => readFileSync(join(import.meta.dirname, '../../.github/workflows/bench.yml'), 'utf8');

it('runs only by hand, with no secrets or environment, and reads inputs through env (no expression in the script)', () => {
  const w = wf();
  expect(w).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
  expect(w).not.toMatch(/secrets\.|environment:/);
  expect(w).toContain('permissions:\n  contents: read');
  const run = w.slice(w.indexOf('run: |'));
  expect(run).not.toContain('${{');
  expect(run).toContain('node tests/bench/brawl-load/real.mjs "$URL" "$ROOM" "$N" "$SECS"');
  // A failed second channel (real.mjs exits 1) must fail the step: a bare wait always returns 0 (PR #105 review).
  expect(run).toContain('wait "$bg"');
  expect(run).not.toMatch(/^ *wait$/m);
});
