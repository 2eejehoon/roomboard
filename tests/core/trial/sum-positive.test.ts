import { describe, expect, it } from 'vitest';
import { sumPositive } from '../../../src/core/trial/sum-positive.ts';

describe('sumPositive (#9)', () => {
  it('ignores negatives', () => {
    expect(sumPositive([3, -5])).toBe(3);
  });

  it('ignores zero and sums only positives', () => {
    expect(sumPositive([0, 1, -2, 4])).toBe(5);
    expect(sumPositive([])).toBe(0);
    expect(sumPositive([-1, 0])).toBe(0);
  });
});
