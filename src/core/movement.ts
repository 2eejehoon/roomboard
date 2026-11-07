import type { Bounds, Vec3 } from './themes.ts';

// m/s, includes headroom for jumps (research R4).
export const MAX_SPEED = 8;

export function validateMove(prev: { p: Vec3; at: number }, next: Vec3, now: number, { min, max }: Bounds): boolean {
  if (!next.every((v, i) => v >= min[i] && v <= max[i])) return false;
  const dist = Math.hypot(next[0] - prev.p[0], next[1] - prev.p[1], next[2] - prev.p[2]);
  return dist <= (MAX_SPEED * Math.max(0, now - prev.at)) / 1000;
}
