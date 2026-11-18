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
