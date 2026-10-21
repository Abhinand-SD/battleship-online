import { useNavigate } from 'react-router';
import { Crosshair, Flame, History, Medal, Ship, Swords, Target, Trophy, UserPlus } from 'lucide-react';
import type { MatchSummary, PlayerStats } from '@battleship/shared';
import { api } from '../lib/api';
import { Avatar } from '../lib/avatars';
import { useStore } from '../lib/store';
import { PageShell } from '../components/ui/PageShell';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAsync } from '../components/menu/useAsync';
import { AchievementCard } from '../components/profile/AchievementCard';
import { MatchRow } from '../components/profile/MatchRow';
import { StatTile } from '../components/profile/StatTile';
import { EmptyState, ErrorState, Skeleton, SkeletonTiles } from '../components/profile/StateViews';
import { formatPercent, formatRank } from '../components/profile/format';

interface StatsData {
  stats: PlayerStats;
  rank: number | null;
}

function StatsHeader({ data }: { data: StatsData }) {
  const user = useStore((s) => s.user);
  const unlocked = data.stats.achievements.filter((a) => a.unlockedAt !== null).length;
  return (
    <Panel strong className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar id={user?.avatar ?? 'anchor'} size={64} ring />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">{user?.displayName ?? 'Captain'}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {user?.username ? <span className="font-mono">@{user.username}</span> : <Badge tone="warning">Guest</Badge>}
            <span>
              {unlocked}/{data.stats.achievements.length} achievements
            </span>
          </p>
        </div>
      </div>
      <dl className="flex gap-6 sm:text-right">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Rating</dt>
          <dd className="font-display text-3xl font-bold tabular-nums text-accent text-glow" data-testid="stats-rating">
            {data.stats.rating.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Rank</dt>
          <dd className="font-display text-3xl font-bold tabular-nums" data-testid="stats-rank">
            {formatRank(data.rank)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function GuestNotice() {
  const navigate = useNavigate();
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl border-amber-400/30 p-4 sm:flex-row sm:items-center sm:justify-between" role="note">
      <div className="flex items-start gap-3">
        <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Create an account to keep your stats across devices</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Your guest profile lives in this browser. Registering keeps your rating, history and achievements and lets you sign in anywhere.
          </p>
        </div>
      </div>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={() => navigate('/account')}>
        Create account
      </Button>
    </div>
  );
}

function StatTiles({ stats }: { stats: PlayerStats }) {
  const streakTone = stats.currentStreak > 0 ? 'success' : stats.currentStreak < 0 ? 'danger' : 'neutral';
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="stat-tiles">
      <StatTile label="Games" value={stats.gamesPlayed} icon={<Swords className="h-4 w-4" />} hint="Online matches" />
      <StatTile label="Wins" value={stats.wins} tone="success" icon={<Trophy className="h-4 w-4" />} />
      <StatTile label="Losses" value={stats.losses} tone="danger" />
      <StatTile label="Win rate" value={formatPercent(stats.winRate)} tone="accent" icon={<Medal className="h-4 w-4" />} />
      <StatTile label="Accuracy" value={formatPercent(stats.accuracy)} icon={<Crosshair className="h-4 w-4" />} hint={`${stats.shotsHit.toLocaleString()} of ${stats.shotsFired.toLocaleString()} shots hit`} />
      <StatTile label="Shots fired" value={stats.shotsFired.toLocaleString()} icon={<Target className="h-4 w-4" />} hint={`${stats.shotsHit.toLocaleString()} hit`} />
      <StatTile label="Ships sunk" value={stats.shipsSunk.toLocaleString()} icon={<Ship className="h-4 w-4" />} />
      <StatTile
        label="Current streak"
        value={stats.currentStreak === 0 ? '0' : `${Math.abs(stats.currentStreak)}${stats.currentStreak > 0 ? 'W' : 'L'}`}
        tone={streakTone}
        icon={<Flame className="h-4 w-4" />}
        hint={stats.currentStreak > 0 ? 'Winning streak' : stats.currentStreak < 0 ? 'Losing streak' : 'No streak yet'}
      />
      <StatTile label="Best streak" value={stats.bestStreak} hint="Consecutive wins" />
      <StatTile label="Practice games" value={stats.practiceGames} hint="Against the AI" />
      <StatTile label="Practice wins" value={stats.practiceWins} hint={stats.practiceGames > 0 ? formatPercent((stats.practiceWins / stats.practiceGames) * 100) : 'No practice games yet'} />
    </div>
  );
}

function MatchHistory({ matches }: { matches: MatchSummary[] }) {
  const navigate = useNavigate();
  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="No matches yet"
        description="Your recent matches will show up here once you have played a game."
        action={
          <Button icon={<Swords className="h-4 w-4" />} onClick={() => navigate('/play')}>
            Play a match
          </Button>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Recent matches">
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} />
      ))}
    </ul>
  );
}

function LoadingView() {
  return (
    <div className="flex flex-col gap-5" data-testid="stats-loading" aria-busy="true" aria-label="Loading stats">
      <Skeleton className="h-28" />
      <SkeletonTiles count={8} />
      <Skeleton className="h-40" />
      <Skeleton className="h-56" />
    </div>
  );
}

export default function StatsScreen() {
  const user = useStore((s) => s.user);
  const statsReq = useAsync(() => api.myStats(), [user?.id]);
  const matchesReq = useAsync(() => api.myMatches(20), [user?.id]);

  const retryAll = () => {
    statsReq.reload();
    matchesReq.reload();
  };

  return (
    <PageShell back="/play" title="Stats">
      {statsReq.loading ? (
        <LoadingView />
      ) : statsReq.error || !statsReq.data ? (
        <ErrorState title="Couldn’t load your stats" error={statsReq.error ?? new Error('No data')} onRetry={retryAll} />
      ) : (
        <div className="flex flex-col gap-5 animate-fade-up">
          <StatsHeader data={statsReq.data} />
          {user?.isGuest && <GuestNotice />}

          <section aria-labelledby="stats-overview">
            <h2 id="stats-overview" className="mb-3 font-display text-lg font-semibold">
              Overview
            </h2>
            <StatTiles stats={statsReq.data.stats} />
          </section>

          <Panel
            title="Achievements"
            subtitle={`${statsReq.data.stats.achievements.filter((a) => a.unlockedAt !== null).length} of ${statsReq.data.stats.achievements.length} unlocked`}
          >
            {statsReq.data.stats.achievements.length === 0 ? (
              <p className="text-sm text-ink-muted">No achievements are available yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Achievements">
                {statsReq.data.stats.achievements.map((a) => (
                  <AchievementCard key={a.key} achievement={a} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Match history"
            subtitle="Your 20 most recent matches"
            actions={
              matchesReq.error ? (
                <Button size="sm" variant="ghost" onClick={matchesReq.reload} loading={matchesReq.loading}>
                  Retry
                </Button>
              ) : undefined
            }
          >
            {matchesReq.loading ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading match history">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : matchesReq.error ? (
              <ErrorState title="Couldn’t load your match history" error={matchesReq.error} onRetry={matchesReq.reload} />
            ) : (
              <MatchHistory matches={matchesReq.data?.matches ?? []} />
            )}
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
