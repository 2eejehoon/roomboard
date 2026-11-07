import { describe, expect, it } from 'vitest';
import { MAX_SPEED, validateMove } from '../../src/core/movement.ts';

const bounds = { min: [-5, 0, -5] as [number, number, number], max: [5, 4, 5] as [number, number, number] };
const prev = { p: [0, 0, 0] as [number, number, number], at: 1000 };

describe('validateMove', () => {
  it('allows a normal step', () => {
    expect(validateMove(prev, [1, 0, 0], 1200, bounds)).toBe(true);
  });

  it('rejects positions outside the bounds on any axis', () => {
    expect(validateMove(prev, [5.01, 0, 0], 5000, bounds)).toBe(false);
    expect(validateMove(prev, [0, -0.01, 0], 5000, bounds)).toBe(false);
    expect(validateMove(prev, [0, 0, -5.01], 5000, bounds)).toBe(false);
    expect(validateMove(prev, [5, 4, -5], 5000, bounds)).toBe(true);
  });

  it('rejects moves faster than 8 m/s', () => {
    expect(MAX_SPEED).toBe(8);
    expect(validateMove(prev, [1.6, 0, 0], 1200, bounds)).toBe(true);
    expect(validateMove(prev, [1.7, 0, 0], 1200, bounds)).toBe(false);
    // 3D distance counts: (1.2, 1.2, 0) is 1.70 m.
    expect(validateMove(prev, [1.2, 1.2, 0], 1200, bounds)).toBe(false);
  });

  it('with no time passed only staying put is allowed', () => {
    expect(validateMove(prev, [0, 0, 0], 1000, bounds)).toBe(true);
    expect(validateMove(prev, [0.1, 0, 0], 1000, bounds)).toBe(false);
  });
});
