import { useEffect, useState } from 'react';
import { serverNow, useStore } from './store';

/** Re-renders every `intervalMs` and returns the approximate server time. */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Milliseconds remaining until a server deadline (never negative). Returns null when no deadline. */
export function useCountdown(deadline: number | null | undefined, intervalMs = 200): number | null {
  const offset = useStore((s) => s.serverOffset);
  const [remaining, setRemaining] = useState<number | null>(() =>
    deadline == null ? null : Math.max(0, deadline - (Date.now() + offset)),
  );
  useEffect(() => {
    if (deadline == null) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, deadline - (Date.now() + offset)));
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [deadline, offset, intervalMs]);
  return remaining;
}

/** Elapsed milliseconds since a server timestamp, updating every second. */
export function useElapsed(since: number | null | undefined, until?: number | null): number {
  const offset = useStore((s) => s.serverOffset);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (since == null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, (until ?? Date.now() + offset) - since));
    tick();
    if (until != null) return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [since, until, offset]);
  return elapsed;
}
