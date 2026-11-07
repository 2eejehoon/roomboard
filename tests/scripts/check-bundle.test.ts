import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (dir: string) => spawnSync('node', ['scripts/check-bundle.mjs', dir], { encoding: 'utf8' });
function bundle(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe('check-bundle (T050)', () => {
  it('passes a bundle without the test hook', () => {
    const res = run(bundle({ 'assets/index.js': 'console.log(1)', 'index.html': '<html></html>' }));
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });

  it('fails and names the file when __roomboard is anywhere in the client bundle', () => {
    const res = run(bundle({ 'assets/index.js': 'ok', 'assets/deep/chunk.js': 'window.__roomboard={}' }));
    expect(res.status).toBe(1);
    expect(res.stdout + res.stderr).toContain('chunk.js');
  });

  it('fails when the bundle directory is missing, so a skipped build cannot pass', () => {
    expect(run(join(tmpdir(), 'no-such-bundle-dir')).status).not.toBe(0);
  });
});
