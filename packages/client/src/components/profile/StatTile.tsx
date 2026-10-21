import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
  className?: string;
}

const toneClasses = {
  neutral: 'text-ink',
  accent: 'text-accent text-glow',
  success: 'text-emerald-300',
  danger: 'text-rose-300',
  warning: 'text-amber-300',
} as const;

/** Compact glass tile for a single statistic. */
export function StatTile({ label, value, hint, icon, tone = 'neutral', className }: StatTileProps) {
  return (
    <div className={cn('glass flex flex-col gap-1 rounded-2xl p-4', className)} data-testid="stat-tile">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
        {icon && (
          <span className="text-ink-dim" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <span className={cn('font-display text-2xl font-bold leading-tight tabular-nums', toneClasses[tone])}>{value}</span>
      {hint && <span className="text-xs text-ink-dim">{hint}</span>}
    </div>
  );
}
