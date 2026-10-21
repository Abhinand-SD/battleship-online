import type { GamePlayerInfo, Perspective } from '@battleship/shared';
import { Avatar } from '../../lib/avatars';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { aiLabel } from './battleModel';

export interface PlayerChipProps {
  player: GamePlayerInfo | null;
  side: Perspective;
  /** Highlight (ring) while it is this player's turn. */
  active?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

/** Avatar, name, rating / AI badge and connection dot for one side of the HUD. */
export function PlayerChip({ player, side, active = false, align = 'left', className }: PlayerChipProps) {
  const isAi = player?.isAi ?? false;
  const connected = player?.connected ?? false;
  const name = player?.displayName ?? (side === 'me' ? 'You' : 'Opponent');
  return (
    <div
      className={cn('flex min-w-0 items-center gap-2.5', align === 'right' && 'flex-row-reverse text-right', className)}
      data-testid={`hud-player-${side}`}
      data-active={active}
    >
      <Avatar id={player?.avatar ?? 'anchor'} size={36} ring={active} ai={isAi} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-ink">
          {name}
          {side === 'me' && <span className="font-normal text-ink-dim"> (you)</span>}
        </p>
        <p className={cn('mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-ink-muted', align === 'right' && 'justify-end')}>
          <span
            className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse-soft')}
            aria-hidden
          />
          <span className="sr-only">{connected ? 'Connected' : 'Disconnected'}</span>
          {isAi ? (
            <Badge tone="accent" className="px-1.5 py-0 text-[9px]">
              {aiLabel(player?.aiDifficulty)}
            </Badge>
          ) : (
            <span className="font-mono tabular-nums">{player ? `${player.rating} rating` : '—'}</span>
          )}
        </p>
      </div>
    </div>
  );
}
