import { Clock, Crosshair, Ship } from 'lucide-react';
import type { MatchSummary } from '@battleship/shared';
import { Avatar } from '../../lib/avatars';
import { cn, relativeTime } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { endReasonLabel, formatDuration, formatPercent, formatSigned, MODE_SHORT_LABELS } from './format';

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

export function MatchRow({ match }: { match: MatchSummary }) {
  const { opponent } = match;
  const ratingChange = match.ratingChange;
  return (
    <li
      className={cn('glass flex flex-col gap-3 rounded-2xl border-l-4 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4', match.won ? 'border-l-emerald-400/70' : 'border-l-rose-500/70')}
      data-testid="match-row"
      data-result={match.won ? 'won' : 'lost'}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar id={opponent.avatar} size={40} ai={opponent.isAi} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold">{opponent.displayName}</span>
            {opponent.isAi && (
              <Badge tone="accent">{opponent.aiDifficulty ? `${DIFFICULTY_LABELS[opponent.aiDifficulty]} AI` : 'AI'}</Badge>
            )}
            <Badge tone="neutral">{MODE_SHORT_LABELS[match.mode]}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {endReasonLabel(match.endReason, match.won)} · {relativeTime(match.endedAt)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-ink-muted sm:flex sm:items-center sm:gap-5">
        <div className="flex items-center gap-1.5" title="Accuracy">
          <Crosshair className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
          <dt className="sr-only">Accuracy</dt>
          <dd className="tabular-nums text-ink">{formatPercent(match.accuracy)}</dd>
        </div>
        <div className="flex items-center gap-1.5" title="Ships sunk / lost">
          <Ship className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
          <dt className="sr-only">Ships sunk and lost</dt>
          <dd className="tabular-nums">
            <span className="text-ink">{match.shipsSunk}</span>
            <span className="text-ink-dim"> / </span>
            <span className="text-ink">{match.shipsLost}</span>
          </dd>
        </div>
        <div className="flex items-center gap-1.5" title="Duration">
          <Clock className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
          <dt className="sr-only">Duration</dt>
          <dd className="tabular-nums text-ink">{formatDuration(match.durationMs)}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 sm:w-28 sm:flex-col sm:items-end sm:justify-center sm:gap-0.5">
        <span className={cn('font-display text-sm font-bold uppercase tracking-wide', match.won ? 'text-emerald-300' : 'text-rose-300')}>
          {match.won ? 'Won' : 'Lost'}
        </span>
        {ratingChange !== null ? (
          <span className={cn('font-mono text-xs tabular-nums', ratingChange > 0 ? 'text-emerald-300' : ratingChange < 0 ? 'text-rose-300' : 'text-ink-muted')}>
            {formatSigned(ratingChange)} rating
          </span>
        ) : (
          <span className="text-xs text-ink-dim">Unrated</span>
        )}
      </div>
    </li>
  );
}
