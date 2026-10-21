import type { ReactNode } from 'react';
import type { GamePlayerInfo } from '@battleship/shared';
import { Avatar } from '../../lib/avatars';
import { cn } from '../../lib/utils';
import { Badge, type BadgeTone } from '../ui/Badge';
import { SonarPulse } from '../ui/Spinner';

export interface SlotStatus {
  tone: BadgeTone;
  label: ReactNode;
}

export interface PlayerSlotProps {
  player: GamePlayerInfo;
  /** "You" / "Opponent" caption above the name. */
  caption: string;
  status: SlotStatus;
  highlight?: boolean;
  testId?: string;
  className?: string;
}

/** A player card used by the lobby and the placement waiting view: avatar, name, rating, guest / AI badges, connection and status. */
export function PlayerSlot({ player, caption, status, highlight = false, testId, className }: PlayerSlotProps) {
  const difficulty = player.aiDifficulty ? player.aiDifficulty.charAt(0).toUpperCase() + player.aiDifficulty.slice(1) : null;
  return (
    <div
      className={cn('glass flex items-center gap-3 rounded-2xl p-3 sm:p-4', highlight && 'border-accent/40 shadow-glow', className)}
      data-testid={testId}
      data-ready={player.ready}
      data-fleet-confirmed={player.fleetConfirmed}
    >
      <Avatar id={player.avatar} size={48} ring={highlight} ai={player.isAi} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{caption}</p>
        <p className="truncate font-display text-base font-semibold text-ink sm:text-lg">{player.displayName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          {player.isAi ? (
            <span>{difficulty ? `${difficulty} AI` : 'AI opponent'}</span>
          ) : (
            <span className="font-mono" title="Rating">
              {player.rating} ELO
            </span>
          )}
          {player.isGuest && !player.isAi && (
            <Badge tone="neutral" className="px-2 py-0 text-[10px]">
              Guest
            </Badge>
          )}
          <ConnectionDot connected={player.connected} />
        </div>
      </div>
      <Badge tone={status.tone} className="shrink-0">
        {status.label}
      </Badge>
    </div>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', connected ? 'text-emerald-300' : 'text-amber-300')} title={connected ? 'Connected' : 'Reconnecting'}>
      <span className={cn('inline-block h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'animate-pulse-soft bg-amber-400')} aria-hidden />
      <span className="sr-only sm:not-sr-only">{connected ? 'Online' : 'Reconnecting…'}</span>
    </span>
  );
}

/** The opponent's seat before anyone has joined. */
export function EmptySlot({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-white/[0.02] p-3 sm:p-4', className)}
      data-testid="lobby-player-empty"
      role="status"
    >
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-ocean-900/60">
        <SonarPulse />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Opponent</p>
        <p className="text-sm text-ink-muted">{message}</p>
      </div>
    </div>
  );
}
