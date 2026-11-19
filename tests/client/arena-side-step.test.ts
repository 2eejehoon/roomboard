// PR #88 review: the 2D step rules (FR-033). A block in the target cell stops the step; no floor under it falls to below koY,
// which the server reads as a knock-out (R4). The 2D entrance walk waits as long as walking there takes (validateMove).
import { describe, expect, it } from 'vitest';
import { entranceWalk, stepTo } from '../../src/client/room/room2d/ArenaSide.tsx';
import { buildGrid, cellKey, makeArena } from '../../src/core/brawl/arena.ts';
import { TUNING } from '../../src/core/brawl/tuning.ts';
import { MAX_SPEED } from '../../src/core/movement.ts';

const arena = makeArena(TUNING);
const floor = buildGrid(arena, new Map());

describe('stepTo', () => {
  it('moves one cell along x or z on the floor (front is -z, back is +z)', () => {
    expect(stepTo(floor, [30.5, 1, 4.5], 1, 0)).toEqual([31.5, 1, 4.5]);
    expect(stepTo(floor, [30.5, 1, 4.5], 0, -1)).toEqual([30.5, 1, 3.5]);
  });

  it('a block in the target cell stops the step', () => {
    const walled = buildGrid(arena, new Map([[cellKey([11, 1, 4]), { cell: [11, 1, 4], kind: 'dirt', hp: 1 }]]));
    expect(stepTo(walled, [30.5, 1, 4.5], 1, 0)).toBeNull();
  });

  it('with no floor under the target it falls below koY', () => {
    const [x, y, z] = stepTo(floor, [43.5, 1, 4.5], 1, 0)!;
    expect([x, z]).toEqual([44.5, 4.5]);
    expect(y).toBeLessThan(arena.koY);
  });
});

describe('entranceWalk', () => {
  it('aims at the middle of the entrance cell and waits as long as walking there at MAX_SPEED takes', () => {
    const { to, waitMs } = entranceWalk([0, 0, 4], [9, 0, 4]);
    expect(to).toEqual([9.5, 0, 4.5]);
    expect(waitMs).toBe(Math.ceil((Math.hypot(9.5, 0.5) / MAX_SPEED) * 1000));
  });
});
