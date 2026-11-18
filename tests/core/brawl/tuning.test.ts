import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../../../src/core/brawl/tuning.ts';

// data-model.md "조정표": the key column names every TUNING entry (FR-030, R7). `{a, b}` expands, `*` is every skill.
const SKILLS = ['jab1', 'jab2', 'jab3', 'smash', 'throw'];
const doc = readFileSync(new URL('../../../specs/004-knockback-brawl/data-model.md', import.meta.url), 'utf8');
const table = doc.split('## 조정표')[1].split('\n## ')[0];
const expand = (key: string): string[] => {
  const brace = key.match(/\{([^}]*)\}/);
  if (brace) return brace[1].split(',').flatMap((part) => expand(key.replace(brace[0], part.trim())));
  return key.includes('*') ? SKILLS.flatMap((s) => expand(key.replace('*', s))) : [key];
};
const docKeys = [
  ...new Set(
    table
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| spec') && !l.startsWith('|---'))
      .flatMap((l) => [...l.split('|')[2].matchAll(/`([^`]+)`/g)].flatMap((m) => expand(m[1]))),
  ),
].sort();

// Arrays are values (a range, a cell, a list of cells), not further keys.
const leaves = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('TUNING', () => {
  it('has exactly the keys of the data-model table', () => {
    expect(docKeys.length).toBeGreaterThan(40);
    expect(leaves(TUNING).sort()).toEqual(docKeys);
  });

  it('holds the spec and research R12 initial values', () => {
    // spec "맨손 기술" table; reach and cooldown from R12.
    const jab = { damage: 3, base: 1, growth: 0.1, angleDeg: 0, reach: 1.2, cooldownMs: 350 };
    expect(TUNING.skills).toEqual({
      jab1: jab,
      jab2: jab,
      jab3: { damage: 5, base: 4, growth: 0.5, angleDeg: 30, reach: 1.2, cooldownMs: 350 },
      smash: { damage: [12, 22], base: 6, growth: 1.2, angleDeg: 35, reach: 1.4, cooldownMs: 800 },
      throw: { damage: 10, base: 5, growth: 0.9, angleDeg: 45, reach: 1, cooldownMs: 600 },
    });
    expect(TUNING).toMatchObject({
      reachSlack: 0.3,
      weight: 100,
      hitstunMsPerStrength: 40,
      hitstunMaxMs: 300, // precedent 2026-11-18-hitstun-cap
      guard: { reduction: 0.8, arcDeg: 120 },
      roll: { invulnMs: 300, stamina: 15 },
      stamina: { max: 100, perSec: 10 },
      jabChainMs: 400,
      smashChargeMs: 1000,
      respawnMs: 3000,
      hitstop: { minMs: 30, maxMs: 150, msPerStrength: 4, finisherStrength: 30 },
      damageColor: { yellowFrom: 50, redFrom: 100 },
      block: { size: 1, hp: { dirt: 1, stone: 4 } },
      wall: { breakAt: { dirt: 3, stone: 10 }, bounce: 0.5, damagePerStrength: 0.5, techWindowMs: 200 },
      steerMaxDeg: 15,
      air: { jumps: 1, recovers: 1, jumpSpeed: 8, recoverSpeed: 12 },
      gravity: 20,
      koDepth: 10,
      match: { stocks: 3, limitMs: 300_000 },
      speedPerStrength: 0.6,
      blockRate: 4,
      stepMs: 1000 / 60,
      groundFriction: 6,
      damageMax: 999,
      jabSteps: 3,
      precision: { p: 2, v: 3 },
      msPerSec: 1000,
      degPerHalfTurn: 180,
      arena: { size: [24, 12, 24], origin: [20, 0, 0], starts: [[4, 1, 4], [19, 1, 4], [4, 1, 19], [19, 1, 19]], exit: [0, 1, 12] },
    });
  });

  it('jab cooldown plus the shortest hitstop outlasts the hitstun cap, so a jabbed fighter can answer (FR-012, US1-7)', () => {
    expect(TUNING.skills.jab1.cooldownMs + TUNING.hitstop.minMs).toBeGreaterThan(TUNING.hitstunMaxMs);
  });
});
