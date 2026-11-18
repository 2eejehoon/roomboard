import { describe, expect, it } from 'vitest';
import { buildGrid, cellKey, cellOf, inArena, makeArena, startPoint, worldOf } from '../../../src/core/brawl/arena.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';
import { THEME_IDS, THEMES } from '../../../src/core/themes.ts';

const arena = makeArena(TUNING);
const overlaps = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) =>
  a.min.every((v, i) => v < b.max[i]) && b.min.every((v, i) => v < a.max[i]);

describe('default arena (FR-016, R5, R12)', () => {
  it('is 24×12×24 cells with one stone layer as the floor', () => {
    expect(arena.size).toEqual([24, 12, 24]);
    expect(arena.defaultBlocks).toHaveLength(24 * 24);
    expect(arena.defaultBlocks.every((b) => b.cell[1] === 0 && b.kind === 'stone' && b.hp === TUNING.block.hp.stone)).toBe(true);
    expect(new Set(arena.defaultBlocks.map((b) => cellKey(b.cell))).size).toBe(24 * 24);
  });

  it('maps cells to world corners (origin + cell × block.size) and back', () => {
    expect(worldOf(arena, [0, 0, 0])).toEqual([20, 0, 0]);
    expect(worldOf(arena, [3, 1, 5])).toEqual([23, 1, 5]);
    expect(cellOf(arena, [23.99, 1, 5.5])).toEqual([3, 1, 5]);
    expect(cellOf(arena, [20, -0.01, 0])).toEqual([0, -1, 0]);
    const half = makeArena({ ...TUNING, block: { ...TUNING.block, size: 0.5 } });
    expect(worldOf(half, [2, 2, 2])).toEqual([21, 1, 1]);
    expect(cellOf(half, [21.2, 1.2, 1.2])).toEqual([2, 2, 2]);
  });

  it('applies the diff: a block adds or replaces, null removes a default block', () => {
    const changed = new Map([
      [cellKey([3, 1, 5]), { cell: [3, 1, 5] as [number, number, number], kind: 'dirt' as const, hp: 1 }],
      [cellKey([4, 0, 4]), null],
    ]);
    const grid = buildGrid(arena, changed);
    expect(grid.get(cellKey([3, 1, 5]))).toEqual({ cell: [3, 1, 5], kind: 'dirt', hp: 1 });
    expect(grid.has(cellKey([4, 0, 4]))).toBe(false);
    expect(grid.get(cellKey([5, 0, 4]))?.kind).toBe('stone');
    expect(grid.size).toBe(24 * 24);
  });

  it('inArena is the arena box; everything else is the peace zone', () => {
    expect(inArena(arena, [32, 1, 12])).toBe(true);
    expect(inArena(arena, [44, 12, 24])).toBe(true);
    expect(inArena(arena, [32, -9, 12])).toBe(true);
    expect(inArena(arena, [19.99, 1, 12])).toBe(false);
    expect(inArena(arena, THEMES.cafe.spawn)).toBe(false);
  });

  it('has starts and an exit on top of the floor, inside the arena', () => {
    expect(arena.starts.length).toBeGreaterThan(1);
    for (const cell of [...arena.starts, arena.exit]) {
      expect(cell[1]).toBe(1);
      expect(inArena(arena, worldOf(arena, cell))).toBe(true);
    }
    // A start point stands in the middle of its cell.
    expect(startPoint(arena, 0)).toEqual([24.5, 1, 4.5]);
    expect(startPoint(arena, arena.starts.length)).toEqual(startPoint(arena, 0));
  });

  it('sits apart from every theme, and each theme entrance cell is inside its theme', () => {
    for (const id of THEME_IDS) {
      const { bounds, arenaEntrance } = THEMES[id];
      expect(overlaps(arena.bounds, bounds), id).toBe(false);
      const corner = arenaEntrance;
      expect(corner.every((v, i) => v >= bounds.min[i] && v + 1 <= bounds.max[i]), id).toBe(true);
    }
  });

  it('knocks out below the floor top minus koDepth', () => {
    expect(arena.koY).toBe(1 - TUNING.koDepth);
    expect(arena.bounds.min[1]).toBe(arena.koY);
  });
});
