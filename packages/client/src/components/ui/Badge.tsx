import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'hit';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-white/5 text-ink-muted border-white/10',
  accent: 'bg-accent-soft text-accent border-accent/30',
  success: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  warning: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  danger: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  hit: 'bg-hit/15 text-orange-300 border-hit/40',
};

export function Badge({ tone = 'neutral', className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tones[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
