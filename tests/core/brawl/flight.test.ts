import { describe, expect, it } from 'vitest';
import { buildGrid, cellKey, makeArena, type Block, type Cell } from '../../../src/core/brawl/arena.ts';
import { positionAt, simulate, type Launch } from '../../../src/core/brawl/flight.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';

const arena = makeArena(TUNING);
const floor = buildGrid(arena, new Map());
const withBlocks = (...cells: Cell[]) =>
  buildGrid(arena, new Map(cells.map((cell) => [cellKey(cell), { cell, kind: 'dirt', hp: 1 } satisfies Block])));
const launch = (p: [number, number, number], v: [number, number, number], s = 1): Launch => ({ t: 1000, p, v, s, cause: 'hit' });
const run = (l: Launch, grid = floor) => simulate(l, grid, arena, TUNING);

describe('simulate (R3, SC-003, SC-004)', () => {
  it('gives the same points twice for the same launch and blocks', () => {
    const l = launch([30.5, 1, 12.5], [3, 6, 1.5], 10);
    expect(run(l)).toEqual(run(l));
  });

  it('steps every 1/60 s under gravity 20', () => {
    const { points } = run(launch([30.5, 5, 12.5], [0, 0, 0]));
    const dt = 1 / 60;
    // After 30 steps the fall is the sum of the per-step falls 20 × dt × dt × (0 + 1 + ... + 29).
    expect(points[30][1]).toBeCloseTo(5 - 20 * dt * dt * ((29 * 30) / 2), 9);
    expect(points[30][0]).toBe(30.5);
  });

  it('lands on a block top from above and ends there without sliding (FR-019)', () => {
    const { end, points } = run(launch([30.5, 1, 12.5], [2, 5, 0], 5));
    expect(end.kind).toBe('land');
    expect(end.p[1]).toBe(1);
    expect(end.p[0]).toBeCloseTo(points.at(-1)![0], 1);
    expect(end.t).toBeGreaterThan(1000);
  });

  it('slides a flat launch from the ground with groundFriction: 0% jab about 5 cm, 100% jab about 3.8 m (R12)', () => {
    const near = run(launch([30.5, 1, 12.5], [0.78, 0, 0], 1.3)).end;
    expect(near.kind).toBe('land');
    expect(near.p[0] - 30.5).toBeCloseTo(0.78 ** 2 / 12, 2);
    const far = run(launch([30.5, 1, 12.5], [6.78, 0, 0], 11.3)).end;
    expect(far.kind).toBe('land');
    expect(far.p[0] - 30.5).toBeCloseTo(6.78 ** 2 / 12, 1);
    expect(far.p[1]).toBe(1);
  });

  it('slides off the edge, falls, and is knocked out below koY', () => {
    const { end, points } = run(launch([43.5, 1, 12.5], [6, 0, 0], 10));
    expect(end.kind).toBe('ko');
    expect(end.p[1]).toBeLessThan(arena.koY);
    expect(points.some((p) => p[0] > 44 && p[1] < 1)).toBe(true);
  });

  it('a fast flight (s ≥ 100, over a cell per step) still stops at the first block on its way', () => {
    const grid = withBlocks([15, 2, 12]);
    const { end } = run(launch([30.5, 2.5, 12.5], [90, 0, 0], 150), grid);
    expect(end).toMatchObject({ kind: 'wall', cell: [15, 2, 12] });
    expect(end.p[0]).toBe(35);
  });

  it('positionAt holds the start during the hitstop and follows the points after', () => {
    const l = launch([30.5, 1, 12.5], [2, 5, 0], 5);
    const sim = run(l);
    expect(positionAt(sim, l, 900, TUNING)).toEqual([30.5, 1, 12.5]);
    expect(positionAt(sim, l, 1000 + (1000 / 60) * 10, TUNING)).toEqual(sim.points[10]);
    expect(positionAt(sim, l, 1e9, TUNING)).toEqual(sim.end.p);
  });
});
