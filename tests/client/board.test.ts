import { describe, expect, it } from 'vitest';
import { ago } from '../../src/client/board/BoardPage.tsx';

// S1 "만든 시각(상대 시간)": the largest unit that fits.
describe('ago', () => {
  const now = Date.UTC(2026, 10, 8, 12);
  it.each([
    [0, '지금'],
    [59_000, '지금'],
    [60_000, '1분 전'],
    [3 * 3_600_000 + 5 * 60_000, '3시간 전'],
    [86_400_000, '어제'],
    [3 * 86_400_000, '3일 전'],
    [-5_000, '지금'], // a client clock behind the server's
  ])('%i ms ago → %s', (ms, text) => {
    expect(ago(now - ms, now)).toBe(text);
  });
});
