import { describe, expect, it } from 'vitest';
import { buildGrid, canPlace, cellKey, cellOf, hitBlock, inArena, makeArena, placeBlock, startPoint, targetCell, worldOf } from '../../../src/core/brawl/arena.ts';
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

describe('placing and breaking blocks (FR-015, FR-015a, FR-016, FR-017, T033)', () => {
  const EAST = Math.PI / 2;
  // Feet in cell [10, 1, 10]: world [30.5, 1, 10.5].
  const feet: [number, number, number] = [30.5, 1, 10.5];
  const fresh = () => {
    const changed = new Map();
    return { changed, grid: buildGrid(arena, changed) };
  };

  it('targets the cell right in front, r rounded to four directions, at feet −1 / 0 / +1', () => {
    expect(targetCell(arena, feet, EAST, 0)).toEqual([11, 1, 10]);
    expect(targetCell(arena, feet, EAST, 1)).toEqual([11, 2, 10]);
    expect(targetCell(arena, feet, EAST, -1)).toEqual([11, 0, 10]);
    expect(targetCell(arena, feet, 0, 0)).toEqual([10, 1, 11]);
    expect(targetCell(arena, feet, Math.PI, 0)).toEqual([10, 1, 9]);
    expect(targetCell(arena, feet, -EAST, 0)).toEqual([9, 1, 10]);
    // 40° rounds to facing +z, 50° to +x: never a diagonal, never my own cell or the one under me.
    expect(targetCell(arena, feet, (40 * Math.PI) / 180, 0)).toEqual([10, 1, 11]);
    expect(targetCell(arena, feet, (50 * Math.PI) / 180, 0)).toEqual([11, 1, 10]);
  });

  it('places only on an empty cell inside the arena that is no start, exit or body', () => {
    const { grid } = fresh();
    expect(canPlace(arena, grid, [11, 1, 10], [])).toBe(true);
    expect(canPlace(arena, grid, [11, 0, 10], []), 'the floor is a block').toBe(false);
    expect(canPlace(arena, grid, [24, 1, 10], []), 'outside the arena').toBe(false);
    expect(canPlace(arena, grid, [11, 12, 10], []), 'above the arena').toBe(false);
    expect(canPlace(arena, grid, [11, -1, 10], [])).toBe(false);
    expect(canPlace(arena, grid, [...arena.starts[0]], [])).toBe(false);
    expect(canPlace(arena, grid, [...arena.exit], [])).toBe(false);
    // A body fills its feet cell and the one above.
    expect(canPlace(arena, grid, [11, 1, 10], [[31.5, 1, 10.5]])).toBe(false);
    expect(canPlace(arena, grid, [11, 2, 10], [[31.5, 1, 10.5]])).toBe(false);
    expect(canPlace(arena, grid, [11, 3, 10], [[31.5, 1, 10.5]])).toBe(true);
  });

  it('a hit takes 1 hp: dirt breaks in one, stone in four, a default floor block too (FR-016)', () => {
    const { changed, grid } = fresh();
    const dirt = placeBlock(arena, changed, grid, [11, 1, 10], 'dirt', TUNING);
    expect(dirt).toEqual({ cell: [11, 1, 10], kind: 'dirt', hp: 1 });
    expect(hitBlock(arena, changed, grid, [11, 1, 10])).toEqual({ cell: [11, 1, 10], kind: null, hp: 0 });
    expect(grid.has(cellKey([11, 1, 10]))).toBe(false);
    expect(changed.has(cellKey([11, 1, 10])), 'a broken placed block leaves no diff').toBe(false);
    expect(hitBlock(arena, changed, grid, [11, 1, 10]), 'nothing to break').toBeNull();

    for (const hp of [3, 2, 1]) expect(hitBlock(arena, changed, grid, [11, 0, 10])).toEqual({ cell: [11, 0, 10], kind: 'stone', hp });
    expect(hitBlock(arena, changed, grid, [11, 0, 10])).toEqual({ cell: [11, 0, 10], kind: null, hp: 0 });
    expect(changed.get(cellKey([11, 0, 10])), 'a broken default block is a null diff').toBeNull();
    expect(buildGrid(arena, changed)).toEqual(grid);
  });
});
