// The knockback flight every screen and the server compute alike (R3): fixed steps, gravity, a cell walk (3D DDA) per step.
// Only + and × on the rounded launch (plus sqrt, which IEEE 754 rounds exactly), so every engine gets the same points.
import type { Vec3 } from '../themes.ts';
import { cellKey, type Arena, type Cell, type Grid } from './arena.ts';
import type { Tuning } from './tuning.ts';

export type Launch = { t: number; p: Vec3; v: Vec3; s: number; cause: 'hit' | 'wall' | 'air' | 'recover' | 'block' };
// wall: a side or bottom face (US1 stops there; US3 adds bounce, break and tech).
export type FlightEnd = { kind: 'land' | 'wall' | 'ko'; t: number; p: Vec3; cell?: Cell };
export type Flight = { points: Vec3[]; end: FlightEnd };

type Hit = { at: Vec3; cell: Cell; axis: number; step: number };

// The first occupied cell the segment a → b enters, in order (Amanatides–Woo).
function firstBlock(arena: Arena, grid: Grid, a: Vec3, b: Vec3): Hit | null {
  const s = arena.cellSize;
  const c0 = a.map((v, i) => (v - arena.origin[i]) / s);
  const d = b.map((v, i) => (v - a[i]) / s);
  const cell = c0.map(Math.floor) as Cell;
  const step = d.map(Math.sign);
  const tMax = d.map((di, i) => (di === 0 ? Infinity : (step[i] > 0 ? cell[i] + 1 - c0[i] : c0[i] - cell[i]) / Math.abs(di)));
  const tDelta = d.map((di) => (di === 0 ? Infinity : 1 / Math.abs(di)));
  for (;;) {
    const axis = tMax.indexOf(Math.min(...tMax));
    const t = tMax[axis];
    if (t > 1) return null;
    cell[axis] += step[axis];
    tMax[axis] += tDelta[axis];
    if (grid.has(cellKey(cell))) {
      const at = a.map((v, i) => v + (b[i] - v) * t) as Vec3;
      // The face we crossed, exactly.
      at[axis] = arena.origin[axis] + (step[axis] > 0 ? cell[axis] : cell[axis] + 1) * s;
      return { at, cell: [...cell], axis, step: step[axis] };
    }
  }
}

function onGround(arena: Arena, grid: Grid, p: Vec3): boolean {
  const y = (p[1] - arena.origin[1]) / arena.cellSize;
  const cx = Math.floor((p[0] - arena.origin[0]) / arena.cellSize);
  const cz = Math.floor((p[2] - arena.origin[2]) / arena.cellSize);
  return Number.isInteger(y) && grid.has(cellKey([cx, y - 1, cz]));
}

export function simulate(launch: Launch, grid: Grid, arena: Arena, t: Tuning): Flight {
  const dt = t.stepMs / t.msPerSec;
  let p = [...launch.p] as Vec3;
  const v = [...launch.v] as Vec3;
  const points: Vec3[] = [p];
  // Only a flat launch from the ground slides (R3); a flight that comes down lands where it touches.
  let sliding = v[1] === 0 && onGround(arena, grid, p);
  for (let i = 1; ; i++) {
    const at = launch.t + i * t.stepMs;
    const next = p.map((x, k) => x + v[k] * dt) as Vec3;
    const hit = firstBlock(arena, grid, p, next);
    if (hit) {
      points.push(hit.at);
      const land = hit.axis === 1 && hit.step < 0;
      return { points, end: { kind: land ? 'land' : 'wall', t: at, p: hit.at, ...(land ? {} : { cell: hit.cell }) } };
    }
    p = next;
    points.push(p);
    if (p[1] < arena.koY) return { points, end: { kind: 'ko', t: at, p } };
    if (sliding) {
      const speed = Math.sqrt(v[0] * v[0] + v[2] * v[2]);
      const left = speed - t.groundFriction * dt;
      if (left <= 0) return { points, end: { kind: 'land', t: at, p } };
      v[0] *= left / speed;
      v[2] *= left / speed;
      sliding = onGround(arena, grid, p);
    } else v[1] -= t.gravity * dt;
  }
}

// Where the flight is at time now: the start during the hitstop, then the nearest step, then the end.
export function positionAt(flight: Flight, launch: Launch, now: number, t: Tuning): Vec3 {
  if (now <= launch.t) return launch.p;
  return flight.points[Math.min(flight.points.length - 1, Math.round((now - launch.t) / t.stepMs))];
}
