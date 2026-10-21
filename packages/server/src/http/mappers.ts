import { ACHIEVEMENTS, roundPercent, type LeaderboardEntry, type MatchSummary, type PlayerStats } from '@battleship/shared';
import type { MatchRecord, StatsRecord, UserRecord } from '../persistence/types';

export function percent(part: number, total: number): number {
  return total <= 0 ? 0 : roundPercent((part / total) * 100);
}

/** Combines a stats row with the user's unlocked achievements into the client-facing PlayerStats. */
export function toPlayerStats(stats: StatsRecord, unlocked: ReadonlyArray<{ key: string; unlockedAt: Date }>): PlayerStats {
  const unlockedAt = new Map(unlocked.map((u) => [u.key, u.unlockedAt] as const));
  return {
    userId: stats.userId,
    gamesPlayed: stats.gamesPlayed,
    wins: stats.wins,
    losses: stats.losses,
    winRate: percent(stats.wins, stats.gamesPlayed),
    shotsFired: stats.shotsFired,
    shotsHit: stats.shotsHit,
    accuracy: percent(stats.shotsHit, stats.shotsFired),
    shipsSunk: stats.shipsSunk,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    rating: stats.rating,
    practiceGames: stats.practiceGames,
    practiceWins: stats.practiceWins,
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      unlockedAt: unlockedAt.get(a.key)?.toISOString() ?? null,
    })),
  };
}

export function toLeaderboardEntry(rank: number, user: UserRecord, stats: StatsRecord): LeaderboardEntry {
  return {
    rank,
    userId: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    isGuest: user.isGuest,
    rating: stats.rating,
    wins: stats.wins,
    losses: stats.losses,
    gamesPlayed: stats.gamesPlayed,
    winRate: percent(stats.wins, stats.gamesPlayed),
    accuracy: percent(stats.shotsHit, stats.shotsFired),
  };
}

/** The match from `userId`'s point of view, or null when the user did not take part. */
export function toMatchSummary(match: MatchRecord, userId: string): MatchSummary | null {
  const me = match.participants.find((p) => p.userId === userId);
  if (!me) return null;
  const opponent = match.participants.find((p) => p !== me) ?? me;
  return {
    id: match.id,
    mode: match.mode,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt.toISOString(),
    durationMs: match.durationMs,
    endReason: match.endReason,
    won: me.won,
    opponent: {
      displayName: opponent.displayName,
      avatar: opponent.avatar,
      isAi: opponent.isAi,
      ...(opponent.aiDifficulty ? { aiDifficulty: opponent.aiDifficulty } : {}),
    },
    shots: me.shots,
    hits: me.hits,
    accuracy: percent(me.hits, me.shots),
    shipsSunk: me.shipsSunk,
    shipsLost: me.shipsLost,
    ratingChange: me.ratingChange,
  };
}
