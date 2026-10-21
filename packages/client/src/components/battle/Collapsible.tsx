import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CollapsibleProps {
  title: ReactNode;
  /** Small trailing text next to the title (e.g. a count). */
  summary?: ReactNode;
  /** Initial state; the section follows later changes of this value (e.g. breakpoint flips). */
  defaultOpen?: boolean;
  /** Render the content without a toggle (always open). */
  alwaysOpen?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/** Accessible disclosure section used for the shot log and the results board review. */
export function Collapsible({ title, summary, defaultOpen = false, alwaysOpen = false, children, className, testId }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const expanded = alwaysOpen || open;

  return (
    <section className={cn('glass rounded-2xl', className)} data-testid={testId} data-open={expanded}>
      {alwaysOpen ? (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <h3 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h3>
          {summary && <span className="text-xs text-ink-muted">{summary}</span>}
        </header>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left hover:bg-white/5 sm:px-5"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="font-display text-base font-semibold text-ink sm:text-lg">{title}</span>
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            {summary}
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
          </span>
        </button>
      )}
      <div id={panelId} hidden={!expanded} className={cn('px-4 pb-4 sm:px-5 sm:pb-5', alwaysOpen && 'pt-4')}>
        {children}
      </div>
    </section>
  );
}
