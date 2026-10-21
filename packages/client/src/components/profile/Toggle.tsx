import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { playSound, unlockAudio } from '../../lib/audio';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Play the UI click sound when toggled (default true). */
  sound?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * Accessible switch row: a labelled `role="switch"` button with an optional description.
 * The whole row is clickable; the switch itself carries the accessible name via `aria-labelledby`.
 */
export function Toggle({ checked, onChange, label, description, disabled = false, sound = true, className, ...rest }: ToggleProps) {
  const labelId = useId();
  const descId = useId();

  const toggle = () => {
    if (disabled) return;
    unlockAudio();
    if (sound) playSound('click');
    onChange(!checked);
  };

  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', disabled && 'opacity-50', className)}>
      <div className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs text-ink-muted">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={toggle}
        data-testid={rest['data-testid']}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed',
          checked ? 'border-accent/70 bg-accent/80 shadow-glow' : 'border-line-strong bg-ocean-800',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow transition-transform duration-200',
            checked ? 'translate-x-5 bg-ocean-950' : 'translate-x-0 bg-ink-muted',
          )}
        />
      </button>
    </div>
  );
}
