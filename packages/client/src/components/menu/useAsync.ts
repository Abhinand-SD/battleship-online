import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Re-runs the request. */
  reload: () => void;
}

/**
 * Small data-fetching hook for the menu screens: runs `fn` on mount and whenever `deps` change,
 * ignores responses from superseded runs and exposes `reload()`. `fn` is read through a ref, so
 * callers can pass an inline arrow without causing refetch loops.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, 'reload'>>({ data: null, error: null, loading: true });
  const [runId, setRunId] = useState(0);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let active = true;
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => {
          if (active) setState({ data, error: null, loading: false });
        },
        (error: unknown) => {
          if (active) setState({ data: null, error, loading: false });
        },
      );
    return () => {
      active = false;
    };
    // The caller controls the dependency list; `fn` is intentionally excluded (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, runId]);

  const reload = useCallback(() => setRunId((n) => n + 1), []);
  return { ...state, reload };
}
