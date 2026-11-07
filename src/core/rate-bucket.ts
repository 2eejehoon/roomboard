// Per-participant token buckets in the room DO (research R9). Time is passed in so the logic stays pure.
export type RateRule = { capacity: number; windowMs: number };
export type TakeResult = { ok: true } | { ok: false; retryAfterMs: number };

export const CHAT_RATE: RateRule = { capacity: 5, windowMs: 10_000 };
export const MOVE_RATE: RateRule = { capacity: 10, windowMs: 1000 };

// Token bucket kept as one "theoretical arrival time" (GCRA): integer ms, no fractional tokens to round.
export class RateBucket {
  private readonly interval: number;
  private readonly burst: number;
  private tat = -Infinity;

  constructor(rule: RateRule) {
    this.interval = rule.windowMs / rule.capacity;
    this.burst = rule.windowMs - this.interval;
  }

  take(now: number): TakeResult {
    const tat = Math.max(this.tat, now);
    if (tat - now > this.burst) return { ok: false, retryAfterMs: tat - now - this.burst };
    this.tat = tat + this.interval;
    return { ok: true };
  }
}
