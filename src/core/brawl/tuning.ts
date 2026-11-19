// The brawl tuning table (FR-030, data-model.md "조정표"): every number the rules use. Core functions take it as an argument.
const jab = { damage: 3, base: 1, growth: 0.1, angleDeg: 0, reach: 1.2, cooldownMs: 350 };

export const TUNING = {
  skills: {
    jab1: jab,
    jab2: jab,
    jab3: { damage: 5, base: 4, growth: 0.5, angleDeg: 30, reach: 1.2, cooldownMs: 350 },
    smash: { damage: [12, 22], base: 6, growth: 1.2, angleDeg: 35, reach: 1.4, cooldownMs: 800 },
    throw: { damage: 10, base: 5, growth: 0.9, angleDeg: 45, reach: 1, cooldownMs: 600 },
  },
  reachSlack: 0.3,
  weight: 100,
  weightBase: 100,
  hitstunMsPerStrength: 40,
  hitstunMaxMs: 300,
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
  arena: {
    size: [24, 12, 24],
    origin: [20, 0, 0],
    starts: [
      [4, 1, 4],
      [19, 1, 4],
      [4, 1, 19],
      [19, 1, 19],
    ],
    exit: [0, 1, 12],
  },
} as const;

// Numbers widened (tuples kept) so a test can pass a copy with other values (SC-005).
type Widen<T> = T extends number ? number : { readonly [K in keyof T]: Widen<T[K]> };
export type Tuning = Widen<typeof TUNING>;
