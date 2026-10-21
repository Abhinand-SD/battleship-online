import { Link } from 'react-router';
import { Crosshair, Flag, Radar, Settings, Timer } from 'lucide-react';
import type { GameSnapshot } from '@battleship/shared';
import { useCountdown, useElapsed } from '../../lib/time';
import { cn, formatClock } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { modeLabel, turnLabel } from './battleModel';
import { PlayerChip } from './PlayerChip';
import { TurnTimer } from './TurnTimer';

export interface BattleHudProps {
  game: GameSnapshot;
  onForfeit: () => void;
}

/** "Battle begins in 3" while the server counts down from READY to IN_BATTLE. */
function BattleCountdown({ endsAt }: { endsAt: number | null }) {
  const remaining = useCountdown(endsAt, 100);
  const seconds = remaining == null ? null : Math.ceil(remaining / 1000);
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-3 py-2"
      role="status"
      aria-live="polite"
      data-testid="battle-countdown"
    >
      <Timer className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="truncate text-sm font-semibold text-ink">
        {seconds != null && seconds > 0 ? (
          <>
            Battle begins in <span className="font-mono text-accent tabular-nums">{seconds}</span>
          </>
        ) : (
          'Battle begins…'
        )}
      </span>
    </div>
  );
}

/** Whose turn it is. `data-turn` mirrors `game.turn` exactly (the e2e suite drives the match from it). */
function TurnIndicator({ turn }: { turn: GameSnapshot['turn'] }) {
  const mine = turn === 'me';
  const Icon = mine ? Crosshair : Radar;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-300',
        mine ? 'border-accent/50 bg-accent-soft shadow-glow' : 'border-line bg-white/[0.03]',
      )}
      role="status"
      aria-live="polite"
      data-testid="turn-indicator"
      {...(turn ? { 'data-turn': turn } : {})}
    >
      <Icon className={cn('h-4 w-4 shrink-0', mine ? 'text-accent' : 'text-ink-muted animate-pulse-soft')} aria-hidden />
      <span className={cn('truncate text-sm font-semibold', mine ? 'text-ink text-glow' : 'text-ink-muted')}>{turnLabel(turn)}</span>
    </div>
  );
}

/** Top bar: mode, both players, the turn indicator / battle countdown, the turn timer and the forfeit action. */
export function BattleHud({ game, onForfeit }: BattleHudProps) {
  const inBattle = game.phase === 'IN_BATTLE';
  const elapsed = useElapsed(game.startedAt);
  return (
    <Panel strong padded={false} className="px-3 py-2.5 sm:px-4 sm:py-3" data-testid="battle-hud">
      <div className="flex items-center justify-between gap-3">
        <PlayerChip player={game.me} side="me" active={inBattle && game.turn === 'me'} className="flex-1" />
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Badge tone="neutral" className="whitespace-nowrap">
            {modeLabel(game)}
          </Badge>
          {game.startedAt != null && (
            <span className="font-mono text-[11px] tabular-nums text-ink-dim" aria-label="Match time">
              {formatClock(elapsed)}
            </span>
          )}
        </div>
        <PlayerChip player={game.opponent} side="opponent" active={inBattle && game.turn === 'opponent'} align="right" className="flex-1" />
      </div>
      <div className="mt-2.5 flex items-center gap-2 sm:gap-3">
        {inBattle ? <TurnIndicator turn={game.turn} /> : <BattleCountdown endsAt={game.countdownEndsAt} />}
        {inBattle && <TurnTimer deadline={game.turnDeadline} myTurn={game.turn === 'me'} />}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Flag className="h-3.5 w-3.5" aria-hidden />}
            onClick={onForfeit}
            data-testid="forfeit-button"
            aria-label="Forfeit match"
            title="Forfeit match"
            className="text-rose-200/80 hover:text-rose-200"
          >
            <span className="hidden sm:inline">Forfeit</span>
          </Button>
          <Link
            to="/settings"
            className="hidden rounded-lg p-2 text-ink-muted hover:bg-white/5 hover:text-ink sm:inline-flex"
            aria-label="Settings"
            title="Sound and display settings"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Panel>
  );
}
