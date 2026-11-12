import { describe, expect, it } from 'vitest';
import { fingerprint, type Frame } from '../../src/core/fingerprint.ts';

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
