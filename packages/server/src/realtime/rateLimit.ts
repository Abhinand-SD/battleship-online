import type { Clock } from '../game/timers';

/**
 * Continuous-refill token bucket: `capacity` tokens are available at once and refill evenly over
 * `windowMs`, so a client may burst up to `capacity` events and then sustain `capacity / windowMs`.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  /** Takes one token if available. */
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Tokens currently available (after refilling up to `now`). */
  available(now: number): number {
    this.refill(now);
    return this.tokens;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.last);
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.capacity) / this.windowMs);
      this.last = now;
    }
  }
}

export interface RateLimiterOptions {
  /** Events allowed per window. */
  capacity: number;
  windowMs: number;
  clock: Clock;
}

/** One token bucket per key (user id). Buckets are dropped with `forget()` when the user goes offline. */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly options: RateLimiterOptions) {}

  /** Returns true when the event is allowed (and consumes a token). */
  allow(key: string): boolean {
    const now = this.options.clock.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.options.capacity, this.options.windowMs, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Drops buckets that are full again (nothing to remember). Called opportunistically. */
  prune(): void {
    const now = this.options.clock.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.available(now) >= this.options.capacity) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
