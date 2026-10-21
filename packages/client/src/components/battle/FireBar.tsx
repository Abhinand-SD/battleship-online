import { AnimatePresence, motion } from 'motion/react';
import { Crosshair, X } from 'lucide-react';
import { coordLabel } from '@battleship/shared';
import { Button } from '../ui/Button';
import type { FireController } from './useFire';
import { useReducedMotionPref } from './useReducedMotionPref';

/** Sticky confirm bar for touch devices: "Fire at D7" + cancel, shown while a cell is aimed. */
export function FireBar({ fire }: { fire: FireController }) {
  const reduced = useReducedMotionPref();
  const visible = fire.needsConfirm && fire.aim !== null;
  return (
    <AnimatePresence>
      {visible && fire.aim && (
        <motion.div
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 32 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          data-testid="fire-bar"
        >
          <div className="glass-strong mx-auto flex max-w-md items-center gap-2 rounded-2xl p-2">
            <Button variant="ghost" size="lg" icon={<X className="h-4 w-4" aria-hidden />} onClick={fire.clearAim} aria-label="Cancel aim">
              Cancel
            </Button>
            <Button
              size="lg"
              fullWidth
              icon={<Crosshair className="h-5 w-5" aria-hidden />}
              onClick={fire.fireAim}
              disabled={!fire.ready}
              data-testid="fire-button"
            >
              Fire at {coordLabel(fire.aim)}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
