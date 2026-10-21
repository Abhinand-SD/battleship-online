import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, leading, trailing, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>}
      <span
        className={cn(
          'flex h-11 items-center gap-2 rounded-xl border bg-ocean-900/70 px-3 transition-colors focus-within:border-accent/70 focus-within:shadow-glow',
          error ? 'border-danger/60' : 'border-line',
        )}
      >
        {leading && <span className="text-ink-dim">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn('h-full w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none', className)}
          {...rest}
        />
        {trailing}
      </span>
      {error ? <span className="mt-1.5 block text-xs text-rose-300">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-ink-dim">{hint}</span> : null}
    </label>
  );
});
