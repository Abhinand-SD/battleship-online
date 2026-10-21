import { cn } from '../../lib/utils';

/** Radar-style spinner. */
export function Spinner({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} role="status" aria-label="Loading">
      <div className="absolute inset-0 rounded-full border border-accent/30" />
      <div className="absolute inset-[22%] rounded-full border border-accent/30" />
      <div className="absolute inset-0 animate-radar-sweep rounded-full [animation-duration:1.6s]" style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,0) 0deg, rgba(34,211,238,0.55) 60deg, rgba(34,211,238,0) 61deg)' }} />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
    </div>
  );
}

export function SonarPulse({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-3 w-3', className)}>
      <span className="absolute inline-flex h-full w-full animate-sonar rounded-full bg-accent/70" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
    </span>
  );
}
