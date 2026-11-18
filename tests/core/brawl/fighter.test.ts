import { describe, expect, it } from 'vitest';
import {
  canAct,
  commitSkill,
  facesFront,
  holdSmash,
  inReach,
  isGuarding,
  newFighter,
  setGuard,
  staminaNow,
  takeHit,
  tryRoll,
  trySkill,
  type Fighter,
} from '../../../src/core/brawl/fighter.ts';
import type { Launch } from '../../../src/core/brawl/flight.ts';
import { TUNING } from '../../../src/core/brawl/tuning.ts';

const T = TUNING;
const launch: Launch = { t: 1035, p: [30, 1, 12], v: [0.78, 0, 0], s: 1.3, cause: 'hit' };
const jabAt = (f: Fighter, now: number, hitstopMs = 35) => {
  const used = trySkill(f, 'jab', now, T);
  if (used) commitSkill(f, used, now, hitstopMs, T);
  return used;
};

describe('skills (FR-007, FR-008, FR-012)', () => {
  it('chains jabs 1 → 2 → 3 when each comes within 0.4 s of the last cooldown end, then starts over', () => {
    const f = newFighter(0, T);
    expect(jabAt(f, 0)?.id).toBe('jab1');
    // cooldown end = 0 + 35 hitstop + 350 = 385
    expect(f.cooldownUntil).toBe(385);
    expect(jabAt(f, 385 + 400)?.id).toBe('jab2');
    expect(jabAt(f, f.cooldownUntil)?.id).toBe('jab3');
    expect(jabAt(f, f.cooldownUntil)?.id).toBe('jab1');
  });

  it('a late jab starts at step 1 again', () => {
    const f = newFighter(0, T);
    jabAt(f, 0);
    expect(jabAt(f, 385 + 401)?.id).toBe('jab1');
  });

  it('ignores a skill before the cooldown ends; a whiff waits only the skill time (no hitstop)', () => {
    const f = newFighter(0, T);
    jabAt(f, 0, 0);
    expect(f.cooldownUntil).toBe(350);
    expect(trySkill(f, 'smash', 349, T)).toBeNull();
    expect(trySkill(f, 'jab', 350, T)).not.toBeNull();
  });

  it('smash charge runs from hold to the skill, capped at 1 s; no hold is no charge', () => {
    const f = newFighter(0, T);
    holdSmash(f, 100);
    expect(trySkill(f, 'smash', 700, T)).toEqual({ id: 'smash', chargeMs: 600 });
    expect(f.holdAt).toBeNull();
    holdSmash(f, 1000);
    expect(trySkill(f, 'smash', 4000, T)?.chargeMs).toBe(1000);
    expect(trySkill(f, 'smash', 5000, T)?.chargeMs).toBe(0);
  });
});

describe('reach and guard arcs', () => {
  it('reaches up to reach + reachSlack in the front half of the facing', () => {
    // facing +x (r = π/2)
    expect(inReach([0, 0, 0], Math.PI / 2, [1.5, 0, 0], 1.2, T)).toBe(true);
    expect(inReach([0, 0, 0], Math.PI / 2, [1.51, 0, 0], 1.2, T)).toBe(false);
    expect(inReach([0, 0, 0], Math.PI / 2, [-1, 0, 0], 1.2, T)).toBe(false);
  });

  it('guards only within 60° either side of the facing (120° front arc)', () => {
    expect(facesFront([0, 0, 0], 0, [0, 0, 1], T)).toBe(true);
    expect(facesFront([0, 0, 0], 0, [Math.sin(Math.PI / 3) - 0.01, 0, Math.cos(Math.PI / 3) + 0.01], T)).toBe(true);
    expect(facesFront([0, 0, 0], 0, [1, 0, 0.1], T)).toBe(false);
    expect(facesFront([0, 0, 0], 0, [0, 0, -1], T)).toBe(false);
  });
});

describe('roll, stamina, hitstun (FR-003, FR-011)', () => {
  it('a roll costs 15 stamina and gives 300 ms of invulnerability; too little stamina is ignored', () => {
    const f = newFighter(0, T);
    for (let i = 0; i < 6; i++) expect(tryRoll(f, 0, T)).toBe(true);
    expect(f.invulnUntil).toBe(300);
    expect(staminaNow(f, 0, T)).toBe(10);
    expect(tryRoll(f, 0, T)).toBe(false);
  });

  it('stamina refills 10 a second up to 100, stored as a value and a time', () => {
    const f = newFighter(0, T);
    tryRoll(f, 0, T);
    expect(staminaNow(f, 1000, T)).toBe(95);
    expect(staminaNow(f, 10_000, T)).toBe(100);
    expect(Object.keys(f)).toContain('staminaAt');
  });

  it('while in hitstun skills, rolls and guarding are refused, but the guard press is recorded', () => {
    const f = newFighter(0, T);
    takeHit(f, { damage: 3, hitstunMs: 52 }, launch, 1000);
    expect(canAct(f, 1051)).toBe(false);
    expect(trySkill(f, 'jab', 1051, T)).toBeNull();
    expect(tryRoll(f, 1051, T)).toBe(false);
    setGuard(f, true, 1040);
    expect(f.guardPressedAt).toBe(1040);
    expect(isGuarding(f, 1051)).toBe(false);
    expect(isGuarding(f, 1052)).toBe(true);
  });

  it('once the hitstun is over skills and rolls work even mid-flight (R2)', () => {
    const f = newFighter(0, T);
    takeHit(f, { damage: 3, hitstunMs: 52 }, launch, 1000);
    expect(f.flight).toEqual(launch);
    expect(trySkill(f, 'jab', 1052, T)?.id).toBe('jab1');
    expect(tryRoll(f, 1052, T)).toBe(true);
    expect(f.flight).toEqual(launch);
  });
});
