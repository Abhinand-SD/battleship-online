import { useReducedMotion, type Variants } from 'motion/react';
import { useStore } from '../../lib/store';

/**
 * Motion preference for `<MotionConfig reducedMotion>`: `'always'` when the user turned motion down in
 * settings (or at OS level), otherwise `'user'` so the OS preference still applies. Under `'always'`
 * transform / layout animations are skipped while opacity fades remain, which keeps entrances tasteful
 * instead of jarring.
 */
export function useMotionMode(): 'always' | 'user' {
  const reducedSetting = useStore((s) => s.settings.reducedMotion);
  const osReduced = useReducedMotion();
  return reducedSetting || osReduced ? 'always' : 'user';
}

/** Plain boolean form of {@link useMotionMode} for non-motion code paths (scroll behaviour etc.). */
export function usePrefersReducedMotion(): boolean {
  return useMotionMode() === 'always';
}

/** Parent variant that staggers its `riseIn` children. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

/** Child variant: short fade + rise. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 28 } },
};

/** Standalone entrance used for content revealed on interaction (pickers, searching state). */
export const revealIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring', stiffness: 360, damping: 30 },
} as const;
