import { describe, expect, it } from 'vitest';
import { facingDir, launchVector, resolveHit } from '../../../src/core/brawl/knockback.ts';
import { TUNING, type Tuning } from '../../../src/core/brawl/tuning.ts';

// Strength is a float sum (1 + 3 × 0.1 is 1.3000000000000003); it is rounded only when it goes into a launch.
const hit = (o: Partial<Parameters<typeof resolveHit>[0]>, tuning: Tuning = TUNING) => {
  const r = resolveHit({ before: 0, skill: 'jab1', chargeMs: 0, guarded: false, ...o }, tuning);
  return { ...r, strength: Number(r.strength.toFixed(9)) };
};

describe('resolveHit (FR-002, FR-003, FR-010, FR-020, SC-004)', () => {
  it('a jab at 0% deals 3% and knocks back with strength 1 + 3 × 0.1 = 1.3', () => {
    expect(hit({})).toEqual({ damage: 3, strength: 1.3, hitstopMs: 35, hitstunMs: 52 });
  });

  it('adds this hit to the damage before the strength (FR-002), and more % means more strength', () => {
    expect(hit({ before: 100 }).strength).toBeCloseTo(1 + 103 * 0.1);
    expect(hit({ before: 100 }).damage).toBe(103);
  });

  it('caps the damage at 999', () => {
    expect(hit({ before: 998, skill: 'jab3' }).damage).toBe(999);
    expect(hit({ before: 995 }).damage).toBe(998);
  });

  it('a guarded jab at 0% goes 1.3 → 0.212 (US1-5): damage × 0.2 first, strength from it, then × 0.2; the % stays exact', () => {
    const r = hit({ guarded: true });
    expect(r.strength).toBeCloseTo(0.212, 10);
    expect(r.damage).toBeCloseTo(0.6, 10);
  });

  it('five guarded jabs add 3%, the 80% cut, not 5% (FR-010, PR #84 review)', () => {
    let before = 0;
    for (let i = 0; i < 5; i++) before = resolveHit({ before, skill: 'jab1', chargeMs: 0, guarded: true }, TUNING).damage;
    expect(before).toBeCloseTo(3, 10);
  });

  it('hitstun is max(hitstop, min(300, s × 40)): a jab 52 ms, a hard hit stops at the 300 ms cap', () => {
    expect(hit({}).hitstunMs).toBe(52);
    expect(hit({ before: 78, skill: 'smash', chargeMs: 1000 })).toMatchObject({ strength: 126, hitstunMs: 300 });
    // A tiny guarded hit is never shorter than its own hitstop.
    expect(hit({ guarded: true }).hitstunMs).toBe(hit({ guarded: true }).hitstopMs);
  });

  it('hitstop is 30 + 4 ms per strength up to 150; finishers (jab 3, full smash, strength ≥ 30) take 150', () => {
    expect(hit({}).hitstopMs).toBe(35);
    expect(hit({ skill: 'jab3' }).hitstopMs).toBe(150);
    expect(hit({ skill: 'smash', chargeMs: 0 }).hitstopMs).toBe(112); // 30 + 20.4 × 4
    expect(hit({ skill: 'smash', chargeMs: 999 }).hitstopMs, 'strength 32.4 ≥ 30').toBe(150);
    expect(hit({ skill: 'smash', chargeMs: 1000 }).hitstopMs).toBe(150);
    expect(hit({ before: 50, skill: 'throw' })).toMatchObject({ strength: 59, hitstopMs: 150 });
  });

  it('smash damage grows with the charge from 12% to 22% (FR-008), R11 strengths 20.4 and 32.4', () => {
    expect(hit({ skill: 'smash', chargeMs: 0 })).toMatchObject({ damage: 12, strength: 20.4 });
    expect(hit({ skill: 'smash', chargeMs: 500 }).damage).toBe(17);
    expect(hit({ skill: 'smash', chargeMs: 1000 })).toMatchObject({ damage: 22, strength: 32.4 });
    expect(hit({ skill: 'smash', chargeMs: 5000 }).damage).toBe(22);
  });

  it('follows a tuning copy (SC-005)', () => {
    const tuning = { ...TUNING, skills: { ...TUNING.skills, jab1: { ...TUNING.skills.jab1, damage: 4 } } };
    expect(hit({}, tuning)).toMatchObject({ damage: 4, strength: 1.4 });
    expect(hit({}, { ...TUNING, hitstunMaxMs: 40 }).hitstunMs).toBe(40);
  });
});

describe('launchVector (FR-004, R3)', () => {
  it('turns the angle and facing into a velocity of s × 0.6 m/s, rounded to 3 decimals', () => {
    expect(launchVector(0, facingDir(Math.PI / 2), 1.3, TUNING)).toEqual([0.78, 0, 0]);
    expect(launchVector(30, facingDir(0), 10, TUNING)).toEqual([0, 3, 5.196]);
    expect(launchVector(45, [-1, 0], 0.212, TUNING)).toEqual([-0.09, 0.09, 0]);
  });

  it('faces [sin r, cos r]', () => {
    const [x, z] = facingDir(Math.PI);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });
});
