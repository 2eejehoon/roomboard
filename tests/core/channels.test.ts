import { describe, expect, it } from 'vitest';
import { CHANNEL_CAPACITY, assignChannel } from '../../src/core/channels.ts';

describe('assignChannel', () => {
  it.each([
    [{}, 1],
    [{ 1: 20 }, 2],
    [{ 1: 20, 2: 5 }, 2],
    [{ 1: 19, 2: 20 }, 1],
    [{ 1: 20, 2: 20 }, 3],
    [{ 2: 5 }, 1],
  ])('%j → %i', (counts, expected) => {
    expect(assignChannel(counts)).toBe(expected);
  });

  it('capacity is 20', () => {
    expect(CHANNEL_CAPACITY).toBe(20);
  });
});
