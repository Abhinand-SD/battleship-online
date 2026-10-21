import { cn } from '../../lib/utils';

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <radialGradient id="lg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#06101f" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lg)" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#22d3ee" strokeOpacity=".35" strokeWidth="2" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="#22d3ee" strokeOpacity=".5" strokeWidth="2" />
      <path d="M32 32 L32 10 A22 22 0 0 1 51 21 Z" fill="#22d3ee" fillOpacity=".35" />
      <circle cx="32" cy="32" r="3" fill="#5eead4" />
      <circle cx="41" cy="26" r="2.5" fill="#ff6a3d" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 30 : 38} />
      {!compact && (
        <span className="font-display text-lg font-bold leading-none tracking-tight">
          Battleship <span className="text-accent">Online</span>
        </span>
      )}
    </span>
  );
}
