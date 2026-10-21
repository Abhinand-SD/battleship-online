import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';

export interface CountdownBannerProps {
  /** Whole seconds left (null hides the banner). */
  seconds: number | null;
  /** e.g. "Starting in" / "Battle starts in". */
  prefix: string;
  /** Shown once the countdown reaches zero while the server finishes the transition. */
  doneLabel: string;
  reducedMotion?: boolean;
  className?: string;
  testId?: string;
}

/** Big "Starting in 3…" banner shared by the lobby and the placement screen. */
export function CountdownBanner({ seconds, prefix, doneLabel, reducedMotion = false, className, testId = 'countdown' }: CountdownBannerProps) {
  if (seconds === null) return null;
  const number = (
    <span className="text-glow inline-block min-w-[1.2em] text-center font-mono text-5xl font-bold text-accent sm:text-6xl" aria-hidden>
      {seconds}
    </span>
  );
  return (
    <div
      className={cn('glass-strong flex flex-col items-center justify-center gap-1 rounded-2xl px-4 py-5 text-center', className)}
      role="status"
      aria-live="assertive"
      aria-label={seconds > 0 ? `${prefix} ${seconds}` : doneLabel}
      data-testid={testId}
      data-seconds={seconds}
    >
      {seconds > 0 ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">{prefix}</p>
          <div className="flex items-end gap-1">
            {reducedMotion ? (
              number
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={seconds}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                >
                  {number}
                </motion.span>
              </AnimatePresence>
            )}
            <span className="pb-2 font-display text-2xl text-ink-muted" aria-hidden>
              …
            </span>
          </div>
        </>
      ) : (
        <p className="font-display text-xl font-semibold text-accent">{doneLabel}</p>
      )}
    </div>
  );
}
