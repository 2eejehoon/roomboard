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

const manifest = (m: unknown) => ({ 'manifest.json': JSON.stringify(m) });
const good = manifest({ version: 'dev', chunks: ['index-BXjaK0XS.js', 'vendor-react-dom-COrNzSM9.js'] });

describe('check-bundle (T050)', () => {
  it('passes a bundle without the test hook', () => {
    const res = run(bundle({ 'assets/index.js': 'console.log(1)', 'index.html': '<html></html>', ...good }));
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });

  it('fails and names the file when __roomboard is anywhere in the client bundle', () => {
    const res = run(bundle({ 'assets/index.js': 'ok', 'assets/deep/chunk.js': 'window.__roomboard={}', ...good }));
    expect(res.status).toBe(1);
    expect(res.stdout + res.stderr).toContain('chunk.js');
  });

  it('fails without a manifest the Worker can use: missing, bad version, no chunks, or no vendor- chunk (002 T036, PR #63 review)', () => {
    for (const files of [
      {},
      manifest({ version: 'a.b@example.com', chunks: ['index-BXjaK0XS.js', 'vendor-zod-BNeHf723.js'] }),
      manifest({ version: '202611131200-abc1234', chunks: [] }),
      manifest({ version: '202611131200-abc1234', chunks: ['index-BXjaK0XS.js'] }),
    ]) {
      const res = run(bundle({ 'assets/index.js': 'ok', ...files }));
      expect(res.status, JSON.stringify(files)).toBe(1);
      expect(res.stdout).toContain('manifest.json');
    }
  });

  it('fails when the bundle directory is missing, so a skipped build cannot pass', () => {
    expect(run(join(tmpdir(), 'no-such-bundle-dir')).status).not.toBe(0);
  });
});
