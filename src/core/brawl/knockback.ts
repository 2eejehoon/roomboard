// Damage, knockback strength, hitstun, hitstop, guard (FR-002, FR-003, FR-010, FR-020) and the launch velocity (FR-004, R3).
import type { Vec3 } from '../themes.ts';
import type { Tuning } from './tuning.ts';

export type SkillId = 'jab1' | 'jab2' | 'jab3' | 'smash' | 'throw';
export type HitInput = { before: number; skill: SkillId; chargeMs: number; guarded: boolean };
export type HitResult = { damage: number; strength: number; hitstopMs: number; hitstunMs: number };

const chargeOf = (chargeMs: number, t: Tuning) => Math.min(chargeMs, t.smashChargeMs) / t.smashChargeMs;

function skillDamage(skill: SkillId, chargeMs: number, t: Tuning): number {
  const d = t.skills[skill].damage;
  if (typeof d === 'number') return d;
  const [min, max] = d;
  return min + (max - min) * chargeOf(chargeMs, t);
}

export function resolveHit({ before, skill, chargeMs, guarded }: HitInput, t: Tuning): HitResult {
  const { base, growth } = t.skills[skill];
  const keep = 1 - t.guard.reduction;
  const dealt = skillDamage(skill, chargeMs, t) * (guarded ? keep : 1);
  const total = Math.min(t.damageMax, before + dealt);
  const strength = (base + total * growth * (t.weightBase / t.weight)) * (guarded ? keep : 1);
  const finisher = skill === 'jab3' || (skill === 'smash' && chargeOf(chargeMs, t) === 1) || strength >= t.hitstop.finisherStrength;
  const hitstopMs = finisher ? t.hitstop.maxMs : Math.round(Math.min(t.hitstop.maxMs, t.hitstop.minMs + strength * t.hitstop.msPerStrength));
  const hitstunMs = Math.max(hitstopMs, Math.round(Math.min(t.hitstunMaxMs, strength * t.hitstunMsPerStrength)));
  // Kept exact: rounding the stored % would add a full 1% per guarded jab (FR-010). Messages round it.
  return { damage: total, strength, hitstopMs, hitstunMs };
}

// The horizontal unit direction for a yaw r (models face +z).
export const facingDir = (r: number): [number, number] => [Math.sin(r), Math.cos(r)];

export const roundTo = (x: number, digits: number) => Number(x.toFixed(digits));

// Only the server calls sin/cos; everyone replays the rounded result (R3).
export function launchVector(angleDeg: number, [dx, dz]: [number, number], strength: number, t: Tuning): Vec3 {
  const a = (angleDeg * Math.PI) / t.degPerHalfTurn;
  const speed = strength * t.speedPerStrength;
  const flat = Math.cos(a) * speed;
  return [dx * flat, Math.sin(a) * speed, dz * flat].map((v) => roundTo(v, t.precision.v) + 0) as Vec3;
}

// FR-028: v turned toward the held horizontal direction d by at most steerMaxDeg, in the plane of v and d, at the same speed.
// Straight along or against d there is no plane, so no turn. A flat launch stays flat (R3).
export function steer(v: Vec3, d: [number, number] | null, t: Tuning): Vec3 {
  const speed = Math.hypot(...v);
  const n = d ? Math.hypot(d[0], d[1]) : 0;
  if (!d || !n || !speed) return v;
  const u = v.map((x) => x / speed);
  const w = [d[0] / n, 0, d[1] / n];
  const cos = u[0] * w[0] + u[2] * w[2];
  const perp = w.map((x, i) => x - cos * u[i]);
  const pn = Math.hypot(...perp);
  if (!pn) return v;
  const a = Math.min((t.steerMaxDeg * Math.PI) / t.degPerHalfTurn, Math.acos(Math.max(-1, Math.min(1, cos))));
  return u.map((x, i) => roundTo((Math.cos(a) * x + (Math.sin(a) * perp[i]) / pn) * speed, t.precision.v) + 0) as Vec3;
}
