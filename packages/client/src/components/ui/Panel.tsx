import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  strong?: boolean;
  padded?: boolean;
}

/** Glass surface used for every card / panel in the app. */
export function Panel({ title, subtitle, actions, strong, padded = true, className, children, ...rest }: PanelProps) {
  return (
    <section className={cn(strong ? 'glass-strong' : 'glass', 'rounded-2xl', padded && 'p-4 sm:p-5', className)} {...rest}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted sm:text-sm">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
