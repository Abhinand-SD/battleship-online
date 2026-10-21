import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { messageOf } from '../menu/errors';

/** Pulsing glass placeholder used while a screen is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('glass animate-pulse-soft rounded-2xl', className)} />;
}

/** A grid of skeleton tiles. */
export function SkeletonTiles({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/** Inline error panel with a retry button. Announced via aria-live. */
export function ErrorState({ title = 'Couldn’t load this page', error, onRetry, retrying = false, className }: ErrorStateProps) {
  return (
    <div role="alert" aria-live="assertive" className={cn('glass flex flex-col items-center gap-3 rounded-2xl border-rose-500/30 p-6 text-center', className)}>
      <AlertTriangle className="h-7 w-7 text-rose-300" aria-hidden />
      <div>
        <p className="font-display text-base font-semibold">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{messageOf(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Retry
        </Button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center', className)}>
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
          {icon}
        </span>
      )}
      <p className="font-display text-base font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
