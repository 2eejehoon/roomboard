import { describe, expect, it } from 'vitest';
import { buildGrid, cellKey, makeArena, type Block, type Cell } from '../../../src/core/brawl/arena.ts';
import { hitWall, positionAt, simulate, type Launch } from '../../../src/core/brawl/flight.ts';
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
    // v²/(2 × 6), give or take one step of travel (0.78 m/s × 1/60 s = 1.3 cm)
    expect(Math.abs(near.p[0] - 30.5 - 0.78 ** 2 / 12)).toBeLessThan(0.013);
    const far = run(launch([30.5, 1, 12.5], [6.78, 0, 0], 11.3)).end;
    expect(far.kind).toBe('land');
    expect(Math.abs(far.p[0] - 30.5 - 6.78 ** 2 / 12)).toBeLessThan(6.78 / 60);
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

describe('walls (FR-019, US3 scenarios 3~5, T034)', () => {
  // A flat flight east at 2.5 m height into the block at [15, 2, 12] (its west face is x = 35), close enough to reach it before falling.
  const toWall = (s: number) => launch([34.8, 2.5, 12.5], [s * TUNING.speedPerStrength, 0, 0], s);
  const hit = (s: number) => run(toWall(s), withBlocks([15, 2, 12])).end;

  it('a side face is a wall with the impact velocity; a top face from above is a landing, not a wall', () => {
    const end = hit(2);
    expect(end).toMatchObject({ kind: 'wall', cell: [15, 2, 12], axis: 0 });
    expect(end.v![0]).toBe(1.2);
    expect(run(launch([30.5, 4, 12.5], [0, -1, 0], 2), withBlocks([10, 2, 12])).end.kind).toBe('land');
  });

  it('strength 2 into dirt bounces back: the face mirrored, strength × 0.5, extra damage strength × 0.5 % (US3-3)', () => {
    const end = hit(2);
    const r = hitWall(toWall(2), end, 'dirt', null, 10, TUNING);
    expect(r.result).toBe('bounce');
    expect(r.damage).toBe(11);
    expect(r.launch).toMatchObject({ t: Math.round(end.t), p: [35, Number(end.p[1].toFixed(2)), 12.5], s: 1, cause: 'wall' });
    // The impact velocity with x mirrored, scaled to strength 1 (0.6 m/s).
    const [vx, vy] = end.v!;
    const n = Math.hypot(vx, vy);
    expect(r.launch!.v).toEqual([-0.6 * vx / n, 0.6 * vy / n, 0].map((x) => Number(x.toFixed(3)) + 0));
  });

  it('dirt from strength 3 and stone from 10 break and fly on unbounced, no extra damage (US3-4); R11 (a): a 0% smash (20.4) breaks stone', () => {
    for (const [s, kind] of [[3, 'dirt'], [10, 'stone'], [20.4, 'stone']] as const) {
      const end = hit(s);
      const r = hitWall(toWall(s), end, kind, null, 10, TUNING);
      expect(r.result).toBe('break');
      expect(r.damage).toBe(10);
      expect(r.launch).toMatchObject({ v: end.v!.map((x) => Number(x.toFixed(3)) + 0), s, cause: 'wall' });
    }
    expect(hitWall(toWall(9.9), hit(9.9), 'stone', null, 10, TUNING).result).toBe('bounce');
  });

  it('a guard press within 200 ms before the wall techs: it stops there with no extra damage (US3-5); breaking comes first', () => {
    const end = hit(2);
    expect(hitWall(toWall(2), end, 'dirt', end.t - 200, 10, TUNING)).toEqual({ result: 'tech', launch: null, damage: 10 });
    expect(hitWall(toWall(2), end, 'dirt', end.t - 201, 10, TUNING).result).toBe('bounce');
    expect(hitWall(toWall(3), hit(3), 'dirt', hit(3).t - 50, 10, TUNING).result).toBe('break');
  });

  it('the extra damage stops at damageMax', () => {
    expect(hitWall(toWall(2), hit(2), 'dirt', null, 998.5, TUNING).damage).toBe(TUNING.damageMax);
  });
});
