import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/agent-gate.mjs');

// A queued second run receives the event payload from when it was created, without agent:attempt-1.
// The gate must decide from the issue's current labels, not the stale payload.
it('reads current labels instead of the stale event payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-gate-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, `#!/bin/sh\necho '{"labels":[{"name":"agent:run"},{"name":"source:user-report"},{"name":"agent:attempt-1"}]}'\n`);
  chmodSync(gh, 0o755);
  const event = join(dir, 'event.json');
  writeFileSync(event, JSON.stringify({ action: 'labeled', label: { name: 'source:user-report' }, issue: { number: 9, labels: [{ name: 'agent:run' }, { name: 'source:user-report' }] } }));
  const out = join(dir, 'out');
  writeFileSync(out, '');
  const r = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'issues', GITHUB_OUTPUT: out },
  });
  expect(r.status).toBe(0);
  expect(readFileSync(out, 'utf8')).toContain('run=false');
});
