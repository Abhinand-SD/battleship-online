import { useCallback, useEffect, useRef, useState } from 'react';

export interface PendingAction<K extends string> {
  /** Key of the action currently running, or `null`. */
  pending: K | null;
  /**
   * Runs `fn` under `key`. While any action is pending further calls are ignored and resolve to
   * `undefined`, so double clicks and overlapping requests never double-submit. The guard is a ref,
   * so it also covers two clicks landing before React re-renders with the disabled state.
   */
  run<T>(key: K, fn: () => Promise<T>): Promise<T | undefined>;
}

/** Companion to `useAsync` for user-triggered requests: one in-flight action at a time, with a pending flag per key. */
export function usePendingAction<K extends string>(): PendingAction<K> {
  const [pending, setPending] = useState<K | null>(null);
  const pendingRef = useRef<K | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(key: K, fn: () => Promise<T>): Promise<T | undefined> => {
    if (pendingRef.current !== null) return undefined;
    pendingRef.current = key;
    setPending(key);
    try {
      return await fn();
    } finally {
      pendingRef.current = null;
      if (mounted.current) setPending(null);
    }
  }, []);

  return { pending, run };
}
