/**
 * Pure functions describing how a recorded match changes player statistics, ratings and achievements.
 * Shared by the in-memory and the Prisma repositories so both behave identically; unit-tested in
 * tests/stats-logic.test.ts.
 */
import { ACHIEVEMENTS, eloDelta, type EndReason, type GameMode } from '@battleship/shared';
import type { MatchParticipantInput, MatchRecordInput, MatchRecordOutcome, StatsRecord } from './types';

/** Elo K-factor used for online (QUICK / PRIVATE) matches. */
export const ELO_K = 32;
/** Rating every player starts with. */
export const DEFAULT_RATING = 1000;
/** Matches needed for the "veteran" achievement (online + practice). */
export const VETERAN_MATCHES = 25;
/** Minimum accuracy (percent) for the "sharpshooter" achievement. */
export const SHARPSHOOTER_ACCURACY = 60;
/** Ships a player must have lost to earn "comeback". */
export const COMEBACK_SHIPS_LOST = 4;
/** Consecutive online wins for "hot_streak". */
export const HOT_STREAK_WINS = 3;

export const ACHIEVEMENT_KEYS: readonly string[] = ACHIEVEMENTS.map((a) => a.key);

const ONLINE_MODES: ReadonlySet<GameMode> = new Set<GameMode>(['QUICK', 'PRIVATE']);

/** Online modes are rated and count towards the public statistics; PRACTICE only tracks practice counters. */
export function isOnlineMode(mode: GameMode): boolean {
  return ONLINE_MODES.has(mode);
}

/** Cancelled matches (never started) are not recorded at all. */
export function shouldRecordMatch(input: Pick<MatchRecordInput, 'endReason'>): boolean {
  return input.endReason !== 'CANCELLED';
}

/** The mutable counters of a stats row (everything except identity and timestamps). */
export type StatsCounters = Omit<StatsRecord, 'userId' | 'updatedAt'>;

export function defaultCounters(): StatsCounters {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    shotsFired: 0,
    shotsHit: 0,
    shipsSunk: 0,
    currentStreak: 0,
    bestStreak: 0,
    rating: DEFAULT_RATING,
    practiceGames: 0,
    practiceWins: 0,
  };
}

export function defaultStatsRecord(userId: string, now: Date = new Date()): StatsRecord {
  return { userId, ...defaultCounters(), updatedAt: now };
}

export type HumanParticipant = MatchParticipantInput & { userId: string };

/** The participants backed by a user account (the AI opponent has no user). */
export function humanParticipants(input: Pick<MatchRecordInput, 'participants'>): HumanParticipant[] {
  return input.participants.filter((p): p is HumanParticipant => !p.isAi && typeof p.userId === 'string' && p.userId.length > 0);
}

/** False for a draw-like result (nobody won); such online matches count as played but not as a loss. */
export function matchHasWinner(input: Pick<MatchRecordInput, 'winnerUserId' | 'participants'>): boolean {
  return input.winnerUserId !== null || input.participants.some((p) => p.won);
}

/**
 * Applies one finished match to a player's counters. Online modes accumulate games/wins/losses, shot
 * counters, ships sunk and streaks; PRACTICE only increments the practice counters. Ratings are left
 * untouched (see computeRatingChange).
 */
export function applyMatchToStats(
  stats: StatsCounters,
  mode: GameMode,
  participant: Pick<MatchParticipantInput, 'won' | 'shots' | 'hits' | 'shipsSunk'>,
  options: { hasWinner?: boolean } = {},
): StatsCounters {
  const hasWinner = options.hasWinner ?? true;
  const next: StatsCounters = { ...stats };
  if (isOnlineMode(mode)) {
    next.gamesPlayed += 1;
    next.shotsFired += participant.shots;
    next.shotsHit += participant.hits;
    next.shipsSunk += participant.shipsSunk;
    if (participant.won) {
      next.wins += 1;
      next.currentStreak += 1;
      next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
    } else if (hasWinner) {
      next.losses += 1;
      next.currentStreak = 0;
    }
  } else {
    next.practiceGames += 1;
    if (participant.won) next.practiceWins += 1;
  }
  return next;
}

export function eloScore(won: boolean, hasWinner: boolean): 0 | 0.5 | 1 {
  if (won) return 1;
  return hasWinner ? 0 : 0.5;
}

/**
 * Elo change for a participant, or null when the match is unrated (practice, or no rated opponent).
 * Uses both players' ratings as stored before the match.
 */
export function computeRatingChange(
  mode: GameMode,
  me: { won: boolean; rating: number },
  opponentRating: number | null,
  hasWinner = true,
): number | null {
  if (!isOnlineMode(mode) || opponentRating === null) return null;
  return eloDelta(me.rating, opponentRating, eloScore(me.won, hasWinner), ELO_K);
}

export interface AchievementContext {
  mode: GameMode;
  endReason: EndReason;
  participant: MatchParticipantInput;
  opponent: MatchParticipantInput;
  /** Stats after this match has been applied (including the new rating / streak). */
  statsAfter: StatsCounters;
  /** Keys the player had already unlocked before this match. */
  unlocked: ReadonlySet<string>;
}

/**
 * Achievement keys newly unlocked by this match (never returns keys that were already unlocked).
 * The "battle quality" achievements (sharpshooter, flawless, comeback) require a real victory by sinking
 * every ship so that an opponent forfeiting on move one cannot hand them out.
 */
export function evaluateAchievements(ctx: AchievementContext): string[] {
  const out: string[] = [];
  const grant = (key: string): void => {
    if (!ctx.unlocked.has(key) && !out.includes(key)) out.push(key);
  };
  const { participant: p, opponent, statsAfter } = ctx;
  const online = isOnlineMode(ctx.mode);
  const sunkThemAll = p.won && ctx.endReason === 'ALL_SUNK';

  if (online && p.won) grant('first_victory');
  if (sunkThemAll && p.shots > 0 && (p.hits / p.shots) * 100 >= SHARPSHOOTER_ACCURACY) grant('sharpshooter');
  if (sunkThemAll && p.shipsLost === 0) grant('flawless');
  if (sunkThemAll && p.shipsLost >= COMEBACK_SHIPS_LOST) grant('comeback');
  if (online && statsAfter.currentStreak >= HOT_STREAK_WINS) grant('hot_streak');
  if (statsAfter.gamesPlayed + statsAfter.practiceGames >= VETERAN_MATCHES) grant('veteran');
  if (ctx.mode === 'PRACTICE' && sunkThemAll && opponent.isAi && opponent.aiDifficulty === 'hard') grant('admiral');
  return out;
}

/** What the store knows about a player before the match is applied. */
export interface ParticipantSnapshot {
  stats: StatsCounters;
  unlocked: ReadonlySet<string>;
}

export interface ComputedParticipant {
  userId: string;
  participant: HumanParticipant;
  statsBefore: StatsCounters;
  /** Counters to persist, rating included. */
  statsAfter: StatsCounters;
  ratingBefore: number;
  /** null when the match was unrated (practice). */
  ratingChange: number | null;
  ratingAfter: number;
  achievementsUnlocked: string[];
}

/**
 * Computes everything a repository has to persist for the human participants of a match:
 * new counters, rating deltas and newly unlocked achievements. Pure: the caller supplies the current
 * snapshots (missing players are treated as brand new) and writes the result back.
 * Returns an empty list for CANCELLED matches.
 */
export function computeMatchOutcome(
  input: MatchRecordInput,
  snapshots: ReadonlyMap<string, ParticipantSnapshot>,
): ComputedParticipant[] {
  if (!shouldRecordMatch(input)) return [];
  const [a, b] = input.participants;
  const hasWinner = matchHasWinner(input);
  const results: ComputedParticipant[] = [];

  for (const [me, opponent] of [
    [a, b],
    [b, a],
  ] as const) {
    if (me.isAi || !me.userId) continue;
    const human: HumanParticipant = { ...me, userId: me.userId };
    const snapshot = snapshots.get(human.userId) ?? { stats: defaultCounters(), unlocked: new Set<string>() };
    const opponentRating =
      opponent.isAi || !opponent.userId ? null : (snapshots.get(opponent.userId)?.stats.rating ?? DEFAULT_RATING);

    const ratingBefore = snapshot.stats.rating;
    const ratingChange = computeRatingChange(input.mode, { won: human.won, rating: ratingBefore }, opponentRating, hasWinner);
    const ratingAfter = ratingBefore + (ratingChange ?? 0);
    const statsAfter: StatsCounters = { ...applyMatchToStats(snapshot.stats, input.mode, human, { hasWinner }), rating: ratingAfter };
    const achievementsUnlocked = evaluateAchievements({
      mode: input.mode,
      endReason: input.endReason,
      participant: human,
      opponent,
      statsAfter,
      unlocked: snapshot.unlocked,
    });

    results.push({
      userId: human.userId,
      participant: human,
      statsBefore: { ...snapshot.stats },
      statsAfter,
      ratingBefore,
      ratingChange,
      ratingAfter,
      achievementsUnlocked,
    });
  }
  return results;
}

/** Shapes the computed result as the MatchRecordOutcome returned by MatchRepository.recordMatch. */
export function toMatchRecordOutcome(computed: readonly ComputedParticipant[]): MatchRecordOutcome {
  return {
    participants: computed.map((c) => ({
      userId: c.userId,
      ratingBefore: c.ratingBefore,
      ratingChange: c.ratingChange ?? 0,
      ratingAfter: c.ratingAfter,
      achievementsUnlocked: [...c.achievementsUnlocked],
    })),
  };
}

/** Leaderboard order: rating desc, wins desc, then user id for a stable order. */
export function compareLeaderboard(a: Pick<StatsRecord, 'rating' | 'wins' | 'userId'>, b: Pick<StatsRecord, 'rating' | 'wins' | 'userId'>): number {
  if (a.rating !== b.rating) return b.rating - a.rating;
  if (a.wins !== b.wins) return b.wins - a.wins;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/** Players appear on the leaderboard once they have played at least one online match. */
export function isRanked(stats: Pick<StatsRecord, 'gamesPlayed'>): boolean {
  return stats.gamesPlayed >= 1;
}
