import { eloDelta } from '@battleship/shared';
import { describe, expect, it } from 'vitest';
import {
  applyMatchToStats,
  compareLeaderboard,
  computeMatchOutcome,
  computeRatingChange,
  defaultCounters,
  evaluateAchievements,
  isOnlineMode,
  matchHasWinner,
  shouldRecordMatch,
  toMatchRecordOutcome,
  type AchievementContext,
  type ParticipantSnapshot,
} from '../src/persistence/statsLogic';
import { aiParticipant, matchInput, participant } from './helpers/repositorySuite';

const snapshot = (rating = 1000, extra: Partial<ReturnType<typeof defaultCounters>> = {}, unlocked: string[] = []): ParticipantSnapshot => ({
  stats: { ...defaultCounters(), rating, ...extra },
  unlocked: new Set(unlocked),
});

describe('modes', () => {
  it('treats QUICK and PRIVATE as online and PRACTICE as offline', () => {
    expect(isOnlineMode('QUICK')).toBe(true);
    expect(isOnlineMode('PRIVATE')).toBe(true);
    expect(isOnlineMode('PRACTICE')).toBe(false);
  });

  it('never records cancelled matches', () => {
    expect(shouldRecordMatch({ endReason: 'CANCELLED' })).toBe(false);
    expect(shouldRecordMatch({ endReason: 'ALL_SUNK' })).toBe(true);
    const input = matchInput({ endReason: 'CANCELLED', participants: [participant({ userId: 'a', won: true }), participant({ userId: 'b' })] });
    expect(computeMatchOutcome(input, new Map())).toEqual([]);
  });
});

describe('applyMatchToStats', () => {
  it('accumulates online wins with streaks and shot counters', () => {
    const after = applyMatchToStats(defaultCounters(), 'QUICK', { won: true, shots: 30, hits: 17, shipsSunk: 5 });
    expect(after).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, shotsFired: 30, shotsHit: 17, shipsSunk: 5, currentStreak: 1, bestStreak: 1, practiceGames: 0 });
    expect(after.rating).toBe(1000);
  });

  it('resets the streak on a loss but keeps the best streak', () => {
    let s = defaultCounters();
    for (let i = 0; i < 3; i++) s = applyMatchToStats(s, 'PRIVATE', { won: true, shots: 20, hits: 17, shipsSunk: 5 });
    expect(s).toMatchObject({ currentStreak: 3, bestStreak: 3, wins: 3 });
    s = applyMatchToStats(s, 'QUICK', { won: false, shots: 25, hits: 9, shipsSunk: 2 });
    expect(s).toMatchObject({ currentStreak: 0, bestStreak: 3, wins: 3, losses: 1, gamesPlayed: 4, shotsFired: 85 });
    s = applyMatchToStats(s, 'QUICK', { won: true, shots: 25, hits: 17, shipsSunk: 5 });
    expect(s).toMatchObject({ currentStreak: 1, bestStreak: 3 });
  });

  it('only touches practice counters for PRACTICE matches', () => {
    const won = applyMatchToStats(defaultCounters(), 'PRACTICE', { won: true, shots: 30, hits: 17, shipsSunk: 5 });
    expect(won).toMatchObject({ practiceGames: 1, practiceWins: 1, gamesPlayed: 0, wins: 0, shotsFired: 0, shotsHit: 0, shipsSunk: 0, currentStreak: 0 });
    const lost = applyMatchToStats(won, 'PRACTICE', { won: false, shots: 30, hits: 10, shipsSunk: 2 });
    expect(lost).toMatchObject({ practiceGames: 2, practiceWins: 1 });
  });

  it('counts a drawn online match as played without a loss or streak reset', () => {
    const start = { ...defaultCounters(), currentStreak: 2, bestStreak: 2, wins: 2, gamesPlayed: 2 };
    const after = applyMatchToStats(start, 'QUICK', { won: false, shots: 10, hits: 3, shipsSunk: 1 }, { hasWinner: false });
    expect(after).toMatchObject({ gamesPlayed: 3, losses: 0, currentStreak: 2 });
    expect(matchHasWinner({ winnerUserId: null, participants: [participant({ userId: 'a' }), participant({ userId: 'b' })] })).toBe(false);
    expect(matchHasWinner({ winnerUserId: 'a', participants: [participant({ userId: 'a' }), participant({ userId: 'b' })] })).toBe(true);
  });
});

describe('Elo', () => {
  it('is symmetric for equal ratings (+16 / -16 with K=32)', () => {
    expect(computeRatingChange('QUICK', { won: true, rating: 1000 }, 1000)).toBe(16);
    expect(computeRatingChange('QUICK', { won: false, rating: 1000 }, 1000)).toBe(-16);
    expect(computeRatingChange('QUICK', { won: false, rating: 1000 }, 1000, false)).toBe(0);
  });

  it('rewards upsets more than expected wins and uses eloDelta from the shared engine', () => {
    const favourite = computeRatingChange('PRIVATE', { won: true, rating: 1200 }, 1000)!;
    const underdog = computeRatingChange('PRIVATE', { won: true, rating: 1000 }, 1200)!;
    expect(favourite).toBeLessThan(16);
    expect(underdog).toBeGreaterThan(16);
    expect(favourite).toBe(eloDelta(1200, 1000, 1, 32));
    expect(underdog).toBe(eloDelta(1000, 1200, 1, 32));
  });

  it('is unrated for practice or when the opponent has no rating', () => {
    expect(computeRatingChange('PRACTICE', { won: true, rating: 1000 }, 1000)).toBeNull();
    expect(computeRatingChange('QUICK', { won: true, rating: 1000 }, null)).toBeNull();
  });

  it('applies mirrored deltas to both humans in computeMatchOutcome', () => {
    const input = matchInput({ participants: [participant({ userId: 'a', won: true }), participant({ userId: 'b' })] });
    const snapshots = new Map([
      ['a', snapshot(1100)],
      ['b', snapshot(1250)],
    ]);
    const [a, b] = computeMatchOutcome(input, snapshots);
    expect(a!.userId).toBe('a');
    expect(b!.userId).toBe('b');
    expect(a!.ratingChange!).toBeGreaterThan(16);
    expect(Math.abs(a!.ratingChange! + b!.ratingChange!)).toBeLessThanOrEqual(1);
    expect(a!.ratingAfter).toBe(1100 + a!.ratingChange!);
    expect(b!.ratingAfter).toBe(1250 + b!.ratingChange!);
    expect(a!.statsAfter.rating).toBe(a!.ratingAfter);
    expect(b!.statsAfter).toMatchObject({ losses: 1, currentStreak: 0 });
    expect(a!.statsBefore.rating).toBe(1100);
  });

  it('defaults unknown players to 1000 and skips the AI', () => {
    const input = matchInput({ mode: 'PRACTICE', participants: [participant({ userId: 'a', won: true }), aiParticipant('medium')] });
    const result = computeMatchOutcome(input, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userId: 'a', ratingBefore: 1000, ratingChange: null, ratingAfter: 1000 });
    expect(result[0]!.statsAfter).toMatchObject({ practiceGames: 1, practiceWins: 1, gamesPlayed: 0 });
    const outcome = toMatchRecordOutcome(result);
    expect(outcome.participants).toEqual([{ userId: 'a', ratingBefore: 1000, ratingChange: 0, ratingAfter: 1000, achievementsUnlocked: [] }]);
  });
});

describe('achievements', () => {
  const base = (over: Partial<AchievementContext> = {}): AchievementContext => ({
    mode: 'QUICK',
    endReason: 'ALL_SUNK',
    participant: participant({ userId: 'a', won: true, shots: 40, hits: 17, shipsLost: 2 }),
    opponent: participant({ userId: 'b' }),
    statsAfter: { ...defaultCounters(), gamesPlayed: 1, wins: 1, currentStreak: 1, bestStreak: 1 },
    unlocked: new Set(),
    ...over,
  });

  it('grants first_victory for the first online win only', () => {
    expect(evaluateAchievements(base())).toEqual(['first_victory']);
    expect(evaluateAchievements(base({ unlocked: new Set(['first_victory']) }))).toEqual([]);
    expect(evaluateAchievements(base({ participant: participant({ userId: 'a', won: false }) }))).toEqual([]);
    expect(evaluateAchievements(base({ mode: 'PRACTICE', opponent: aiParticipant('easy') }))).toEqual([]);
    expect(evaluateAchievements(base({ endReason: 'FORFEIT' }))).toEqual(['first_victory']);
  });

  it('grants sharpshooter at 60% accuracy and above', () => {
    const at60 = base({ participant: participant({ userId: 'a', won: true, shots: 30, hits: 18, shipsLost: 1 }), unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(at60)).toEqual(['sharpshooter']);
    const below = base({ participant: participant({ userId: 'a', won: true, shots: 30, hits: 17, shipsLost: 1 }), unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(below)).toEqual([]);
    const noShots = base({ participant: participant({ userId: 'a', won: true, shots: 0, hits: 0, shipsLost: 1 }), unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(noShots)).toEqual([]);
  });

  it('grants flawless and comeback only for wins by sinking every ship', () => {
    const flawless = base({ participant: participant({ userId: 'a', won: true, shipsLost: 0 }), unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(flawless)).toEqual(['flawless']);
    expect(evaluateAchievements({ ...flawless, endReason: 'FORFEIT' })).toEqual([]);
    const comeback = base({ participant: participant({ userId: 'a', won: true, shipsLost: 4 }), unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(comeback)).toEqual(['comeback']);
    expect(evaluateAchievements({ ...comeback, endReason: 'TIMEOUT' })).toEqual([]);
    const lost = base({ participant: participant({ userId: 'a', won: false, shipsLost: 0 }) });
    expect(evaluateAchievements(lost)).toEqual([]);
  });

  it('grants hot_streak at three consecutive online wins', () => {
    const ctx = base({ statsAfter: { ...defaultCounters(), gamesPlayed: 3, wins: 3, currentStreak: 3, bestStreak: 3 }, unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(ctx)).toEqual(['hot_streak']);
    expect(evaluateAchievements({ ...ctx, statsAfter: { ...ctx.statsAfter, currentStreak: 2 } })).toEqual([]);
  });

  it('grants veteran at 25 matches across online and practice', () => {
    const ctx = base({ statsAfter: { ...defaultCounters(), gamesPlayed: 10, practiceGames: 15, wins: 5, currentStreak: 1 }, unlocked: new Set(['first_victory']) });
    expect(evaluateAchievements(ctx)).toEqual(['veteran']);
    expect(evaluateAchievements({ ...ctx, statsAfter: { ...ctx.statsAfter, practiceGames: 14 } })).toEqual([]);
  });

  it('grants admiral only for beating the hard AI by sinking everything', () => {
    const ctx = base({ mode: 'PRACTICE', opponent: aiParticipant('hard'), statsAfter: { ...defaultCounters(), practiceGames: 1, practiceWins: 1 } });
    expect(evaluateAchievements(ctx)).toEqual(['admiral']);
    expect(evaluateAchievements({ ...ctx, opponent: aiParticipant('medium') })).toEqual([]);
    expect(evaluateAchievements({ ...ctx, endReason: 'FORFEIT' })).toEqual([]);
    expect(evaluateAchievements({ ...ctx, mode: 'QUICK' })).toEqual(['first_victory']);
  });

  it('can grant several achievements at once without duplicates', () => {
    const ctx = base({
      participant: participant({ userId: 'a', won: true, shots: 20, hits: 17, shipsLost: 0 }),
      statsAfter: { ...defaultCounters(), gamesPlayed: 3, wins: 3, currentStreak: 3, bestStreak: 3, practiceGames: 22 },
    });
    expect(evaluateAchievements(ctx).sort()).toEqual(['first_victory', 'flawless', 'hot_streak', 'sharpshooter', 'veteran']);
  });
});

describe('leaderboard order', () => {
  it('sorts by rating desc, wins desc, then user id', () => {
    const rows = [
      { userId: 'c', rating: 1000, wins: 2 },
      { userId: 'a', rating: 1000, wins: 2 },
      { userId: 'b', rating: 1050, wins: 1 },
      { userId: 'd', rating: 1000, wins: 3 },
    ];
    expect([...rows].sort(compareLeaderboard).map((r) => r.userId)).toEqual(['b', 'd', 'a', 'c']);
  });
});
