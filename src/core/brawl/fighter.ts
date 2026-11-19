// A fighter's state and what it may do (data-model.md "Fighter", FR-007~012, FR-034). Times are server ms; only values and
// times are stored, so the state survives in a socket attachment (R6).
import type { Vec3 } from '../themes.ts';
import type { Launch } from './flight.ts';
import { facingDir, type SkillId } from './knockback.ts';
import type { Tuning } from './tuning.ts';

export type Fighter = {
  damage: number;
  stamina: number;
  staminaAt: number;
  stunUntil: number;
  invulnUntil: number;
  // Per skill (FR-012): a whiffed smash does not hold back a jab.
  cooldownUntil: Record<'jab' | 'smash' | 'throw', number>;
  jabStep: number;
  jabAt: number;
  holdAt: number | null;
  guarding: boolean;
  guardPressedAt: number | null;
  inputDir: [number, number] | null;
  airJumps: number;
  airRecovers: number;
  flight: Launch | null;
  knockedOutAt: number | null;
};
export type UsedSkill = { id: SkillId; step?: number; chargeMs: number };

export const newFighter = (now: number, t: Tuning): Fighter => ({
  damage: 0,
  stamina: t.stamina.max,
  staminaAt: now,
  stunUntil: 0,
  invulnUntil: 0,
  cooldownUntil: { jab: 0, smash: 0, throw: 0 },
  jabStep: 0,
  jabAt: 0,
  holdAt: null,
  guarding: false,
  guardPressedAt: null,
  inputDir: null,
  airJumps: t.air.jumps,
  airRecovers: t.air.recovers,
  flight: null,
  knockedOutAt: null,
});

export const canAct = (f: Fighter, now: number) => f.knockedOutAt === null && now >= f.stunUntil;
// A press during hitstun is kept for the wall tech (FR-019) but does not guard (FR-003).
export const isGuarding = (f: Fighter, now: number) => f.guarding && canAct(f, now);
export const staminaNow = (f: Fighter, now: number, t: Tuning) => Math.min(t.stamina.max, f.stamina + ((now - f.staminaAt) * t.stamina.perSec) / t.msPerSec);

export function setGuard(f: Fighter, on: boolean, now: number): void {
  f.guarding = on;
  if (on) f.guardPressedAt = now;
}

export function holdSmash(f: Fighter, now: number): void {
  if (canAct(f, now)) f.holdAt = now;
}

// The skill a press turns into now, or null if refused. The jab chain counts from the last jab's cooldown end (FR-012).
export function trySkill(f: Fighter, k: 'jab' | 'smash' | 'throw', now: number, t: Tuning): UsedSkill | null {
  const holdAt = f.holdAt;
  if (k === 'smash') f.holdAt = null;
  if (!canAct(f, now) || now < f.cooldownUntil[k]) return null;
  if (k === 'throw') return { id: 'throw', chargeMs: 0 };
  if (k === 'smash') return { id: 'smash', chargeMs: holdAt === null ? 0 : Math.min(now - holdAt, t.smashChargeMs) };
  const step = f.jabStep > 0 && f.jabStep < t.jabSteps && now - f.jabAt <= t.jabChainMs ? f.jabStep + 1 : 1;
  return { id: `jab${step}` as SkillId, step, chargeMs: 0 };
}

// Cooldown from the attacker's hitstop end (FR-012). Returns readyAt.
export function commitSkill(f: Fighter, used: UsedSkill, now: number, hitstopMs: number, t: Tuning): number {
  const readyAt = now + hitstopMs + t.skills[used.id].cooldownMs;
  f.cooldownUntil[used.step ? 'jab' : (used.id as 'smash' | 'throw')] = readyAt;
  if (used.step) [f.jabStep, f.jabAt] = [used.step, readyAt];
  return readyAt;
}

export function tryRoll(f: Fighter, now: number, t: Tuning): boolean {
  const stamina = staminaNow(f, now, t);
  if (!canAct(f, now) || stamina < t.roll.stamina) return false;
  [f.stamina, f.staminaAt, f.invulnUntil] = [stamina - t.roll.stamina, now, now + t.roll.invulnMs];
  return true;
}

export function takeHit(f: Fighter, hit: { damage: number; hitstunMs: number }, launch: Launch, now: number): void {
  [f.damage, f.stunUntil, f.flight, f.holdAt] = [hit.damage, now + hit.hitstunMs, launch, null];
}

const toward = (from: Vec3, to: Vec3) => [to[0] - from[0], to[2] - from[2]];

// Within reach + slack and in the front half of the attacker's facing.
export function inReach(from: Vec3, r: number, to: Vec3, reach: number, t: Tuning): boolean {
  const [dx, dz] = toward(from, to);
  const [fx, fz] = facingDir(r);
  return Math.hypot(dx, to[1] - from[1], dz) <= reach + t.reachSlack && dx * fx + dz * fz >= 0;
}

// The attacker is within half the guard arc of the defender's facing (FR-010).
export function facesFront(defender: Vec3, r: number, attacker: Vec3, t: Tuning): boolean {
  const [dx, dz] = toward(defender, attacker);
  const [fx, fz] = facingDir(r);
  const half = (t.guard.arcDeg / 2) * (Math.PI / t.degPerHalfTurn);
  return dx * fx + dz * fz >= Math.cos(half) * Math.hypot(dx, dz);
}
