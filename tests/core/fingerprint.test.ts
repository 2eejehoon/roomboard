import { describe, expect, it } from 'vitest';
import { fingerprint as fp, type Frame } from '../../src/core/fingerprint.ts';

const sha256 = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
const fingerprint = (name: string, frames: Frame[]) => fp(name, frames, sha256);

const f = (file: string, fn: string, line = 1, col = 1): Frame => ({ file, fn, line, col });
const app = [f('assets/index-abc.js', 'RoomPage'), f('assets/index-abc.js', 'useRoom'), f('assets/room3d-def.js', 'Avatar')];

describe('fingerprint', () => {
  it('is 16 hex chars', async () => {
    expect(await fingerprint('TypeError', app)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ignores line and column changes', async () => {
    const moved = app.map((x, i) => ({ ...x, line: x.line + 10 * i + 7, col: 99 }));
    expect(await fingerprint('TypeError', moved)).toBe(await fingerprint('TypeError', app));
  });

  it('ignores the build hash in chunk names, so a redeploy keeps the fingerprint (FR-012)', async () => {
    const rebuilt = app.map((x) => ({ ...x, file: x.file.replace('-abc.js', '-BXjaK0XS.js').replace('-def.js', '-B6_g54-M.js') }));
    const other = app.map((x) => ({ ...x, file: x.file.replace('-abc.js', '-Wy9s6hX0.js').replace('-def.js', '-BIMq5mOQ.js') }));
    expect(await fingerprint('TypeError', rebuilt)).toBe(await fingerprint('TypeError', other));
  });

  it('uses only the top 3 app frames', async () => {
    expect(await fingerprint('TypeError', [...app, f('assets/index-abc.js', 'main')])).toBe(await fingerprint('TypeError', app));
    expect(await fingerprint('TypeError', app.slice(0, 2))).not.toBe(await fingerprint('TypeError', app));
  });

  it('skips vendor and node_modules frames', async () => {
    const noisy = [f('assets/vendor-123.js', 'render'), app[0]!, f('node_modules/react/index.js', 'x'), app[1]!, app[2]!];
    expect(await fingerprint('TypeError', noisy)).toBe(await fingerprint('TypeError', app));
  });

  it('differs by error name and by frame', async () => {
    const base = await fingerprint('TypeError', app);
    expect(await fingerprint('RangeError', app)).not.toBe(base);
    expect(await fingerprint('TypeError', [app[0]!, app[1]!, f('assets/room3d-def.js', 'Other')])).not.toBe(base);
  });
});
