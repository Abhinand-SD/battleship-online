import { useEffect, useRef } from 'react';
import { playSound } from '../../lib/audio';
import { countdownSeconds } from './gameMeta';

/** Only short "3… 2… 1…" countdowns tick; longer timers stay silent. */
const MAX_TICKING_SECONDS = 10;

/**
 * Plays a 'tick' every time the whole-second value of a countdown changes and 'go' when it reaches zero.
 * `playSound` already honours the user's sound setting. Returns the whole seconds remaining (or null).
 */
export function useCountdownSounds(remainingMs: number | null): number | null {
  const seconds = countdownSeconds(remainingMs);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (seconds === null) {
      last.current = null;
      return;
    }
    const prev = last.current;
    if (prev === seconds) return;
    last.current = seconds;
    if (seconds > 0) {
      if (seconds <= MAX_TICKING_SECONDS) playSound('tick');
    } else if (prev !== null && prev > 0) {
      // Only celebrate a countdown we actually watched reach zero (not a stale deadline on mount).
      playSound('go');
    }
  }, [seconds]);

  return seconds;
}
