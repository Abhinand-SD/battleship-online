import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
}

/** Reactive media query (false when matchMedia is unavailable, e.g. in jsdom). */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

/** Tailwind `lg` breakpoint (64rem). */
export const DESKTOP_QUERY = '(min-width: 64rem)';
