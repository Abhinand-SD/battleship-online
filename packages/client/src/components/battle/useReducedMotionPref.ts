import { useStore } from '../../lib/store';
import { useMediaQuery } from './useMediaQuery';

/** True when either the in-app setting or the OS preference asks for reduced motion. */
export function useReducedMotionPref(): boolean {
  const setting = useStore((s) => s.settings.reducedMotion);
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  return setting || system;
}
