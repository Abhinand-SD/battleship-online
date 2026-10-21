import { Award, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import type { GameResult } from '@battleship/shared';
import { cn, formatClock } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { formatRatingChange, statRows, unlockedAchievements } from './resultsModel';

export interface StatsTableProps {
  result: GameResult;
  opponentName: string;
  className?: string;
}

/** Side-by-side match statistics plus rating change and unlocked achievements. */
export function StatsTable({ result, opponentName, className }: StatsTableProps) {
  const rows = statRows(result.stats);
  const achievements = unlockedAchievements(result.achievements);
  const rating = result.ratingChange;

  return (
    <Panel title="Match statistics" className={className} data-testid="stats-table">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" className="gap-1.5 normal-case tracking-normal">
          <Clock className="h-3 w-3" aria-hidden />
          Duration <span className="font-mono tabular-nums text-ink" data-testid="stat-duration">{formatClock(result.durationMs)}</span>
        </Badge>
        {rating !== undefined && (
          <Badge
            tone={rating > 0 ? 'success' : rating < 0 ? 'danger' : 'neutral'}
            className="gap-1.5 normal-case tracking-normal"
            data-testid="rating-change"
            data-direction={rating > 0 ? 'up' : rating < 0 ? 'down' : 'flat'}
          >
            {rating > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : rating < 0 ? <TrendingDown className="h-3 w-3" aria-hidden /> : null}
            Rating <span className="font-mono tabular-nums">{formatRatingChange(rating)}</span>
          </Badge>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
            <th scope="col" className="pb-2 text-left font-semibold">
              Stat
            </th>
            <th scope="col" className="pb-2 text-right font-semibold text-accent">
              You
            </th>
            <th scope="col" className="max-w-[8rem] truncate pb-2 text-right font-semibold">
              {opponentName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line/60" data-testid={`stat-row-${r.key}`}>
              <th scope="row" className="py-2 text-left font-medium text-ink-muted">
                {r.label}
              </th>
              <td
                className={cn('py-2 text-right font-mono tabular-nums', r.better === 'me' ? 'font-bold text-accent' : 'text-ink')}
                {...(r.testId ? { 'data-testid': r.testId } : {})}
              >
                {r.me}
              </td>
              <td className={cn('py-2 text-right font-mono tabular-nums', r.better === 'opponent' ? 'font-bold text-ink' : 'text-ink-muted')}>{r.opponent}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {achievements.length > 0 && (
        <div className="mt-5" data-testid="achievements">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">Achievements unlocked</p>
          <ul className="space-y-2">
            {achievements.map((a) => (
              <li key={a.key} className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2" data-testid={`achievement-${a.key}`}>
                <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-100">{a.name}</p>
                  <p className="text-xs text-ink-muted">{a.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
