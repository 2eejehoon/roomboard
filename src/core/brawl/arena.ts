// The arena island (data-model.md "경기장", R5): default blocks, cell ↔ world, the diff, the peace zone.
import type { Bounds, Vec3 } from '../themes.ts';
import type { Tuning } from './tuning.ts';

export type Cell = [number, number, number];
export type BlockKind = 'dirt' | 'stone';
export type Block = { cell: Cell; kind: BlockKind; hp: number };
// null is a default block that was broken.
export type Changes = Map<string, Block | null>;
export type Grid = Map<string, Block>;
export type Arena = {
  bounds: Bounds;
  origin: Vec3;
  size: Cell;
  cellSize: number;
  defaultBlocks: Block[];
  starts: Cell[];
  exit: Cell;
  koY: number;
};

export const cellKey = ([x, y, z]: readonly number[]) => `${x},${y},${z}`;

export function makeArena(tuning: Tuning): Arena {
  const origin = [...tuning.arena.origin] as Vec3;
  const size = [...tuning.arena.size] as Cell;
  const s = tuning.block.size;
  const defaultBlocks: Block[] = [];
  for (let x = 0; x < size[0]; x++) for (let z = 0; z < size[2]; z++) defaultBlocks.push({ cell: [x, 0, z], kind: 'stone', hp: tuning.block.hp.stone });
  const koY = origin[1] + s - tuning.koDepth;
  return {
    bounds: { min: [origin[0], koY, origin[2]], max: origin.map((o, i) => o + size[i] * s) as Vec3 },
    origin,
    size,
    cellSize: s,
    defaultBlocks,
    starts: tuning.arena.starts.map((c) => [...c] as Cell),
    exit: [...tuning.arena.exit] as Cell,
    koY,
  };
}

export const worldOf = (a: Arena, cell: readonly number[]): Vec3 => a.origin.map((o, i) => o + cell[i] * a.cellSize) as Vec3;
export const cellOf = (a: Arena, p: Vec3): Cell => p.map((v, i) => Math.floor((v - a.origin[i]) / a.cellSize)) as Cell;
export const sameCell = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);
export const inArena = (a: Arena, p: Vec3) => p.every((v, i) => v >= a.bounds.min[i] && v <= a.bounds.max[i]);

// The middle of start cell i (wrapping), standing on its floor.
export function startPoint(a: Arena, i: number): Vec3 {
  const [x, y, z] = worldOf(a, a.starts[i % a.starts.length]);
  return [x + a.cellSize / 2, y, z + a.cellSize / 2];
}

export function buildGrid(a: Arena, changed: Changes): Grid {
  const grid: Grid = new Map(a.defaultBlocks.map((b) => [cellKey(b.cell), b]));
  for (const [key, block] of changed) {
    if (block) grid.set(key, block);
    else grid.delete(key);
  }
  return grid;
}

// FR-015a: the cell right in front (r rounded to the nearest of four directions) at feet height + h. Never my own cell or the
// one under me, since it is always one step to the side.
export function targetCell(a: Arena, p: Vec3, r: number, h: -1 | 0 | 1): Cell {
  const q = (Math.round(r / (Math.PI / 2)) * Math.PI) / 2;
  const [x, y, z] = cellOf(a, p);
  return [x + Math.round(Math.sin(q)), y + h, z + Math.round(Math.cos(q))];
}

const inside = (a: Arena, c: Cell) => c.every((v, i) => v >= 0 && v < a.size[i]);

// FR-015a, FR-017: inside the arena, no start or exit, and empty: no block, no body (a body fills its feet cell and the one above).
export function canPlace(a: Arena, grid: Grid, c: Cell, bodies: Vec3[]): boolean {
  if (!inside(a, c) || grid.has(cellKey(c)) || [...a.starts, a.exit].some((s) => sameCell(s, c))) return false;
  return !bodies.some((p) => {
    const [x, y, z] = cellOf(a, p);
    return x === c[0] && z === c[2] && (y === c[1] || y + 1 === c[1]);
  });
}

export function placeBlock(a: Arena, changed: Changes, grid: Grid, cell: Cell, kind: BlockKind, t: Tuning): Block {
  const block = { cell, kind, hp: t.block.hp[kind] };
  grid.set(cellKey(cell), block);
  changed.set(cellKey(cell), block);
  return block;
}

const isDefault = (a: Arena, c: Cell) => a.defaultBlocks.some((b) => sameCell(b.cell, c));

// Removes a block (a break or a wall broken through): a default block leaves a null diff, a placed one none.
export function removeBlock(a: Arena, changed: Changes, grid: Grid, cell: Cell): void {
  grid.delete(cellKey(cell));
  if (isDefault(a, cell)) changed.set(cellKey(cell), null);
  else changed.delete(cellKey(cell));
}

// FR-015: one hit takes 1 hp, 0 removes it. The result is the block message's cell, kind and hp; null when there is no block.
export function hitBlock(a: Arena, changed: Changes, grid: Grid, cell: Cell): { cell: Cell; kind: BlockKind | null; hp: number } | null {
  const b = grid.get(cellKey(cell));
  if (!b) return null;
  if (b.hp > 1) {
    const hit = { ...b, cell, hp: b.hp - 1 };
    grid.set(cellKey(cell), hit);
    changed.set(cellKey(cell), hit);
    return hit;
  }
  removeBlock(a, changed, grid, cell);
  return { cell, kind: null, hp: 0 };
}
