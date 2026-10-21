/**
 * Small clock / scheduler abstraction so game logic never touches `Date.now` or `setTimeout` directly.
 * The SessionManager is given a `Clock`; production uses real timers, tests use `createManualClock()`.
 */

export interface TimerHandle {
  cancel(): void;
}

export interface Clock {
  /** Current epoch milliseconds. */
  now(): number;
  /** Schedules `fn` to run once after `ms` milliseconds. */
  setTimeout(fn: () => void, ms: number): TimerHandle;
}

/** Real timers backed by the Node.js event loop. */
export function createRealClock(): Clock {
  return {
    now: () => Date.now(),
    setTimeout(fn, ms) {
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        fn();
      }, Math.max(0, ms));
      return {
        cancel() {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        },
      };
    },
  };
}

export interface ManualClock extends Clock {
  /**
   * Advances the clock by `ms`, firing every due timer in order of due time (FIFO on ties). Timers
   * scheduled by callbacks are honoured when they fall inside the advanced window.
   */
  advance(ms: number): void;
  /** Runs the timers due at the current time (zero-delay timers). */
  runDue(): void;
  /** Number of timers that are still pending. */
  pending(): number;
  /** Moves the clock without firing any timers (rarely needed). */
  set(now: number): void;
}

interface ManualTimer {
  id: number;
  due: number;
  fn: () => void;
  cancelled: boolean;
}

/** Deterministic clock for tests: time only moves when `advance()` is called. */
export function createManualClock(start = 1_700_000_000_000): ManualClock {
  let now = start;
  let seq = 0;
  let timers: ManualTimer[] = [];

  const fireUntil = (limit: number): void => {
    // Loop until no timer is due at or before `limit`; callbacks may schedule new timers.
    for (;;) {
      let next: ManualTimer | null = null;
      for (const t of timers) {
        if (t.cancelled) continue;
        if (t.due > limit) continue;
        if (!next || t.due < next.due || (t.due === next.due && t.id < next.id)) next = t;
      }
      if (!next) break;
      timers = timers.filter((t) => t !== next && !t.cancelled);
      if (next.due > now) now = next.due;
      next.fn();
    }
    if (limit > now) now = limit;
  };

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const timer: ManualTimer = { id: seq++, due: now + Math.max(0, ms), fn, cancelled: false };
      timers.push(timer);
      return {
        cancel() {
          timer.cancelled = true;
          timers = timers.filter((t) => t !== timer);
        },
      };
    },
    advance(ms) {
      fireUntil(now + Math.max(0, ms));
    },
    runDue() {
      fireUntil(now);
    },
    pending() {
      return timers.filter((t) => !t.cancelled).length;
    },
    set(next) {
      now = next;
    },
  };
}

/** Holder for an optional timer that is replaced/cancelled as a unit. */
export class TimerSlot {
  private handle: TimerHandle | null = null;

  constructor(private readonly clock: Clock) {}

  /** Cancels any pending timer and schedules a new one. */
  set(fn: () => void, ms: number): void {
    this.clear();
    this.handle = this.clock.setTimeout(() => {
      this.handle = null;
      fn();
    }, ms);
  }

  clear(): void {
    if (this.handle) {
      this.handle.cancel();
      this.handle = null;
    }
  }

  get active(): boolean {
    return this.handle !== null;
  }
}
