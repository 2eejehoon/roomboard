import { describe, expect, it } from 'vitest';
import { CHAT_RATE, MOVE_RATE, RateBucket } from '../../src/core/rate-bucket.ts';

describe('RateBucket', () => {
  it('chat: 5 per 10 s, the 6th is refused with retryAfterMs', () => {
    expect(CHAT_RATE).toEqual({ capacity: 5, windowMs: 10_000 });
    const b = new RateBucket(CHAT_RATE, 0);
    for (let i = 0; i < 5; i++) expect(b.take(100 * i), `msg ${i + 1}`).toEqual({ ok: true });
    // 400 ms after start, one token refills every 2,000 ms: 0.2 tokens back, next one in 1,600 ms.
    expect(b.take(400)).toEqual({ ok: false, retryAfterMs: 1600 });
    expect(b.take(2000)).toEqual({ ok: true });
    expect(b.take(2000)).toEqual({ ok: false, retryAfterMs: 2000 });
  });

  it('refused takes do not use tokens', () => {
    const b = new RateBucket(CHAT_RATE, 0);
    for (let i = 0; i < 5; i++) b.take(0);
    for (let i = 0; i < 10; i++) b.take(1000);
    expect(b.take(2000)).toEqual({ ok: true });
  });

  it('refills up to capacity only', () => {
    const b = new RateBucket(CHAT_RATE, 0);
    const results = Array.from({ length: 6 }, () => b.take(1_000_000).ok);
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('move: 10 per second', () => {
    expect(MOVE_RATE).toEqual({ capacity: 10, windowMs: 1000 });
    const b = new RateBucket(MOVE_RATE, 0);
    const first = Array.from({ length: 11 }, (_, i) => b.take(i).ok);
    expect(first.filter(Boolean)).toHaveLength(10);
    expect(b.take(1100).ok).toBe(true);
  });
});
