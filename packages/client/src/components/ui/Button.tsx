import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { playSound, unlockAudio } from '../../lib/audio';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  /** Play the UI click sound (default true). */
  sound?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-accent to-accent-deep text-ocean-950 font-semibold shadow-glow hover:brightness-110 hover:shadow-glow-strong active:brightness-95 disabled:shadow-none',
  secondary:
    'border border-line-strong bg-accent-soft/40 text-ink hover:bg-accent-soft hover:border-accent/60 active:bg-accent-soft/60',
  ghost: 'text-ink-muted hover:text-ink hover:bg-white/5 active:bg-white/10',
  subtle: 'bg-white/5 text-ink hover:bg-white/10 border border-white/5',
  danger: 'border border-danger/40 bg-danger/10 text-rose-200 hover:bg-danger/20 active:bg-danger/30',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
  xl: 'h-14 px-8 text-lg gap-3 rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconRight, fullWidth, sound = true, className, children, disabled, onClick, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onClick={(e) => {
        unlockAudio();
        if (sound) playSound('click');
        onClick?.(e);
      }}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});
