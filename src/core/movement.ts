import type { Bounds, Vec3 } from './themes.ts';

// m/s, includes headroom for jumps (research R4).
export const MAX_SPEED = 8;

const inside = (p: Vec3, { min, max }: Bounds) => p.every((v, i) => v >= min[i] && v <= max[i]);

// Walkable areas are the theme and the arena (004 R5); a move must stay inside the area it started in.
export function validateMove(prev: { p: Vec3; at: number }, next: Vec3, now: number, areas: Bounds[]): boolean {
  if (!areas.some((a) => inside(prev.p, a) && inside(next, a))) return false;
  const dist = Math.hypot(next[0] - prev.p[0], next[1] - prev.p[1], next[2] - prev.p[2]);
  return dist <= (MAX_SPEED * Math.max(0, now - prev.at)) / 1000;
}
