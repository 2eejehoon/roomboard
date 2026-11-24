// T023: skill input (R2, FR-012, FR-032): a jab pressed during the cooldown is held and sent once readyAt has passed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrawlInput, flashTimer } from '../../src/client/brawl/input.ts';

let server = 0;
let readyAt = 0;
let sent: object[] = [];
let shown: string[] = [];
const input = () =>
  createBrawlInput({ send: (m) => sent.push(m), serverNow: () => server, readyAt: () => readyAt, show: (k) => shown.push(k) });

beforeEach(() => {
  vi.useFakeTimers();
  [server, readyAt, sent, shown] = [1000, 0, [], []];
});
afterEach(() => vi.useRealTimers());

describe('brawl input', () => {
  it('sends a jab at once with a fresh nonce and shows it before the server answers', () => {
    const i = input();
    i.press('jab');
    i.press('throw');
    expect(sent).toEqual([
      { t: 'skill', k: 'jab', nonce: 's1' },
      { t: 'skill', k: 'throw', nonce: 's2' },
    ]);
    expect(shown).toEqual(['jab', 'throw']);
  });

  it('holds one jab pressed during the cooldown and sends it when readyAt has passed', () => {
    const i = input();
    readyAt = 1300;
    i.press('jab');
    i.press('jab');
    expect(sent).toEqual([]);
    server = 1299;
    vi.advanceTimersByTime(299);
    expect(sent).toEqual([]);
    server = 1300;
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([{ t: 'skill', k: 'jab', nonce: 's1' }]);
    expect(shown).toEqual(['jab']);
  });

  it('a second jab pressed before the first swing comes back is held for the jab cooldown, not sent at once (PR #87 review)', () => {
    const i = input();
    i.press('jab');
    i.press('jab');
    expect(sent).toEqual([{ t: 'skill', k: 'jab', nonce: 's1' }]);
    server = 1349;
    vi.advanceTimersByTime(349);
    expect(sent).toHaveLength(1);
    server = 1350;
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([
      { t: 'skill', k: 'jab', nonce: 's1' },
      { t: 'skill', k: 'jab', nonce: 's2' },
    ]);
  });

  it('smash charges between press (hold) and release (skill); guard and roll pass through', () => {
    const i = input();
    i.press('smash');
    i.release('smash');
    i.guard(true);
    i.guard(false);
    i.roll([0, 1]);
    expect(sent).toEqual([
      { t: 'hold', k: 'smash' },
      { t: 'skill', k: 'smash', nonce: 's1' },
      { t: 'guard', on: true },
      { t: 'guard', on: false },
      { t: 'roll', d: [0, 1] },
    ]);
  });

  it('dispose drops a held jab', () => {
    const i = input();
    readyAt = 1300;
    i.press('jab');
    i.dispose();
    server = 2000;
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
  });
});

// T056: frames longer than the flash (120 ms on a slow phone) skipped it entirely, and a press handled after the frame's flash check
// read the same performance.now() as that frame.
describe('swing flash', () => {
  it('stays on for its duration, and on at least the next frame however long frames take', () => {
    const f = flashTimer(120);
    f.show(1000);
    expect(f.visible(1000)).toBe(true); // the same instant as the press
    expect(f.visible(1100)).toBe(true);
    expect(f.visible(1130)).toBe(false);
    f.show(2000);
    expect(f.visible(2150)).toBe(true); // a 150 ms frame
    expect(f.visible(2300)).toBe(false);
  });
});
