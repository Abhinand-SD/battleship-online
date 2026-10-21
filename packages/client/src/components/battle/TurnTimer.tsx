import { useEffect, useRef } from 'react';
import { playSound } from '../../lib/audio';
import { serverNow, useStore } from '../../lib/store';
import { useCountdown } from '../../lib/time';
import { cn } from '../../lib/utils';
import { timerTone, type TimerTone } from './battleModel';

export interface TurnTimerProps {
  /** Epoch ms when the turn expires; the timer is hidden when null (practice games have no clock). */
  deadline: number | null;
  /** Tick sounds only play for the local player's own turn. */
  myTurn: boolean;
  className?: string;
}

const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TICK_UNDER_MS = 5_000;

const toneClass: Record<TimerTone, string> = {
  normal: 'text-accent',
  warning: 'text-amber-300',
  danger: 'text-rose-400',
};

/** Ring + seconds countdown for the current turn. Colour shifts amber under 10s and red (pulsing) under 5s. */
export function TurnTimer({ deadline, myTurn, className }: TurnTimerProps) {
  const remaining = useCountdown(deadline, 100);
  const sound = useStore((s) => s.settings.sound);

  // Full length of this turn, captured once per deadline so the ring scale matches the server's turn timeout.
  const totalRef = useRef<{ deadline: number; total: number } | null>(null);
  if (deadline != null && totalRef.current?.deadline !== deadline) {
    totalRef.current = { deadline, total: Math.max(deadline - serverNow(), 1_000) };
  }

  const seconds = remaining == null ? null : Math.ceil(remaining / 1000);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!myTurn || !sound || remaining == null || seconds == null) return;
    if (remaining <= 0 || remaining > TICK_UNDER_MS) return;
    if (lastTick.current === seconds) return;
    lastTick.current = seconds;
    playSound('tick');
  }, [remaining, seconds, myTurn, sound]);

  if (deadline == null || remaining == null || seconds == null) return null;

  const total = totalRef.current?.total ?? Math.max(remaining, 1_000);
  const fraction = Math.min(1, Math.max(0, remaining / total));
  const tone = timerTone(remaining);

  return (
    <div
      className={cn('relative flex h-12 w-12 shrink-0 items-center justify-center', tone === 'danger' && 'animate-pulse-soft', className)}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds left in this turn`}
      title={`${seconds}s left`}
      data-testid="turn-timer"
      data-tone={tone}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={cn('transition-[stroke-dashoffset,color] duration-150', toneClass[tone])}
        />
      </svg>
      <span className={cn('relative font-mono text-sm font-bold tabular-nums', toneClass[tone])}>{seconds}</span>
    </div>
  );
}
