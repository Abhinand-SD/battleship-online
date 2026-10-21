import { Crown, Medal, RefreshCw, Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '@battleship/shared';
import { api } from '../lib/api';
import { Avatar } from '../lib/avatars';
import { useStore } from '../lib/store';
import { cn } from '../lib/utils';
import { PageShell } from '../components/ui/PageShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAsync } from '../components/menu/useAsync';
import { EmptyState, ErrorState, Skeleton } from '../components/profile/StateViews';
import { formatPercent } from '../components/profile/format';

const PAGE_SIZE = 50;

const MEDALS: Record<number, { className: string; label: string }> = {
  1: { className: 'bg-gradient-to-br from-amber-200 to-amber-500 text-ocean-950 shadow-[0_0_18px_rgba(251,191,36,0.45)]', label: 'Gold' },
  2: { className: 'bg-gradient-to-br from-slate-100 to-slate-400 text-ocean-950 shadow-[0_0_14px_rgba(226,232,240,0.35)]', label: 'Silver' },
  3: { className: 'bg-gradient-to-br from-orange-300 to-amber-700 text-ocean-950 shadow-[0_0_14px_rgba(217,119,6,0.35)]', label: 'Bronze' },
};

function RankCell({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (medal) {
    return (
      <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold', medal.className)} title={medal.label}>
        {rank === 1 ? <Crown className="h-4 w-4" aria-hidden /> : <Medal className="h-4 w-4" aria-hidden />}
        <span className="sr-only">
          {medal.label}, rank {rank}
        </span>
      </span>
    );
  }
  return <span className="inline-flex h-8 w-8 items-center justify-center font-mono text-sm tabular-nums text-ink-muted">{rank}</span>;
}

const CELL = 'px-3 py-2.5 sm:px-4';
const NUM = 'text-right tabular-nums';

function LeaderboardRow({ entry, isMe, footer = false }: { entry: LeaderboardEntry; isMe: boolean; footer?: boolean }) {
  return (
    <tr
      className={cn('border-t border-line/60 transition-colors', isMe ? 'bg-accent-soft/60 ring-1 ring-inset ring-accent/40' : 'hover:bg-white/[0.03]', footer && 'border-t-2 border-dashed border-line-strong')}
      data-testid="leaderboard-row"
      data-user-id={entry.userId}
      data-me={isMe || undefined}
      aria-current={isMe ? 'true' : undefined}
    >
      <td className={cn(CELL, 'w-14')}>
        <RankCell rank={entry.rank} />
      </td>
      <td className={cn(CELL, 'min-w-0')}>
        <div className="flex items-center gap-3">
          <Avatar id={entry.avatar} size={34} ring={isMe} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={cn('truncate text-sm font-semibold', isMe && 'text-accent')}>{entry.displayName}</span>
              {isMe && <Badge tone="accent">You</Badge>}
              {entry.isGuest && <Badge tone="neutral">Guest</Badge>}
            </div>
            <p className="text-xs text-ink-muted sm:hidden">
              {entry.wins}W / {entry.losses}L · {formatPercent(entry.winRate)} wins
            </p>
          </div>
        </div>
      </td>
      <td className={cn(CELL, NUM, 'font-display text-base font-bold text-accent')}>{entry.rating.toLocaleString()}</td>
      <td className={cn(CELL, NUM, 'hidden text-sm sm:table-cell')}>
        <span className="text-emerald-300">{entry.wins}</span>
        <span className="text-ink-dim"> / </span>
        <span className="text-rose-300">{entry.losses}</span>
      </td>
      <td className={cn(CELL, NUM, 'hidden text-sm text-ink-muted md:table-cell')}>{entry.gamesPlayed}</td>
      <td className={cn(CELL, NUM, 'hidden text-sm sm:table-cell')}>{formatPercent(entry.winRate)}</td>
      <td className={cn(CELL, NUM, 'hidden text-sm text-ink-muted md:table-cell')}>{formatPercent(entry.accuracy)}</td>
    </tr>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2" data-testid="leaderboard-loading" aria-busy="true" aria-label="Loading leaderboard">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

export default function LeaderboardScreen() {
  const user = useStore((s) => s.user);
  const token = useStore((s) => s.token);
  const board = useAsync(() => api.leaderboard(PAGE_SIZE, 0), []);
  // Own rank, used to render a footer row when the player is outside the top entries. Best-effort.
  const mine = useAsync(async () => (token ? api.myStats() : null), [token, user?.id]);

  const entries = board.data?.entries ?? [];
  const inList = user ? entries.some((e) => e.userId === user.id) : false;
  const myEntry: LeaderboardEntry | null =
    user && !inList && mine.data && mine.data.rank !== null
      ? {
          rank: mine.data.rank,
          userId: user.id,
          displayName: user.displayName,
          avatar: user.avatar,
          isGuest: user.isGuest,
          rating: mine.data.stats.rating,
          wins: mine.data.stats.wins,
          losses: mine.data.stats.losses,
          gamesPlayed: mine.data.stats.gamesPlayed,
          winRate: mine.data.stats.winRate,
          accuracy: mine.data.stats.accuracy,
        }
      : null;

  const refresh = () => {
    board.reload();
    mine.reload();
  };

  return (
    <PageShell back="/play" title="Leaderboard">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Trophy className="h-6 w-6 text-amber-300" aria-hidden />
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Top {PAGE_SIZE} captains by rating. Only online matches count.</p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw className={cn('h-3.5 w-3.5', board.loading && 'animate-spin')} />} onClick={refresh} disabled={board.loading}>
          Refresh
        </Button>
      </div>

      {board.loading ? (
        <LoadingRows />
      ) : board.error ? (
        <ErrorState title="Couldn’t load the leaderboard" error={board.error} onRetry={refresh} />
      ) : entries.length === 0 ? (
        <EmptyState icon={<Trophy className="h-6 w-6" />} title="No ranked players yet" description="Win an online match to claim the first spot." />
      ) : (
        <div className="glass overflow-hidden rounded-2xl animate-fade-up">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Players ranked by rating</caption>
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th scope="col" className={cn(CELL, 'w-14')}>
                  Rank
                </th>
                <th scope="col" className={CELL}>
                  Player
                </th>
                <th scope="col" className={cn(CELL, NUM)}>
                  Rating
                </th>
                <th scope="col" className={cn(CELL, NUM, 'hidden sm:table-cell')}>
                  W / L
                </th>
                <th scope="col" className={cn(CELL, NUM, 'hidden md:table-cell')}>
                  Games
                </th>
                <th scope="col" className={cn(CELL, NUM, 'hidden sm:table-cell')}>
                  Win rate
                </th>
                <th scope="col" className={cn(CELL, NUM, 'hidden md:table-cell')}>
                  Accuracy
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <LeaderboardRow key={entry.userId} entry={entry} isMe={entry.userId === user?.id} />
              ))}
            </tbody>
            {myEntry && (
              <tfoot data-testid="leaderboard-footer">
                <LeaderboardRow entry={myEntry} isMe footer />
              </tfoot>
            )}
          </table>
          {user && !inList && !myEntry && !mine.loading && !mine.error && (
            <p className="border-t border-line/60 px-4 py-3 text-center text-xs text-ink-muted" data-testid="leaderboard-unranked">
              You’re not ranked yet — win an online match to appear here.
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
