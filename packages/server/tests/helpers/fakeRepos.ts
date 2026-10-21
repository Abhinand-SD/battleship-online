import { ACHIEVEMENTS, eloDelta } from '@battleship/shared';
import type {
  AchievementRepository,
  MatchParticipantRecord,
  MatchRecord,
  MatchRecordInput,
  MatchRecordOutcome,
  MatchRepository,
  ParticipantOutcome,
  Repositories,
  StatsRecord,
  StatsRepository,
  UserRecord,
  UserRepository,
} from '../../src/persistence/types';

/**
 * In-memory implementation of the persistence interfaces for tests. Behaves like the real store for
 * everything the game server touches: users, ratings, match recording (with Elo + streaks) and achievements.
 */
export interface FakeRepositories extends Repositories {
  matches: FakeMatchRepository;
  /** Creates a user directly (no password handling). */
  addUser(input: { id?: string; displayName: string; avatar?: string; isGuest?: boolean; username?: string | null }): UserRecord;
  setRating(userId: string, rating: number): void;
}

export interface FakeMatchRepository extends MatchRepository {
  /** Every recordMatch input, in call order. */
  calls: MatchRecordInput[];
  /** When set, recordMatch rejects with this error (tests persistence failure handling). */
  failWith: Error | null;
}

const DEFAULT_RATING = 1000;

export function createFakeRepos(): FakeRepositories {
  const users = new Map<string, UserRecord>();
  const stats = new Map<string, StatsRecord>();
  const matches = new Map<string, MatchRecord>();
  const achievements = new Map<string, Map<string, Date>>();
  let seq = 0;

  const defaultStats = (userId: string): StatsRecord => ({
    userId,
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
    updatedAt: new Date(),
  });

  const getStats = (userId: string): StatsRecord => {
    let row = stats.get(userId);
    if (!row) {
      row = defaultStats(userId);
      stats.set(userId, row);
    }
    return row;
  };

  const makeUser = (input: {
    id?: string;
    displayName: string;
    avatar?: string;
    isGuest?: boolean;
    username?: string | null;
    passwordHash?: string | null;
  }): UserRecord => {
    const now = new Date();
    const user: UserRecord = {
      id: input.id ?? `user-${++seq}`,
      username: input.username ?? null,
      passwordHash: input.passwordHash ?? null,
      displayName: input.displayName,
      avatar: input.avatar ?? 'anchor',
      isGuest: input.isGuest ?? true,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    users.set(user.id, user);
    return user;
  };

  const userRepo: UserRepository = {
    async createGuest(input) {
      return makeUser({ ...input, isGuest: true });
    },
    async createAccount(input) {
      return makeUser({ ...input, isGuest: false });
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async findManyByIds(ids) {
      return ids.map((id) => users.get(id)).filter((u): u is UserRecord => !!u);
    },
    async findByUsername(username) {
      for (const u of users.values()) if (u.username === username) return u;
      return null;
    },
    async upgradeToAccount(id, input) {
      const user = users.get(id);
      if (!user) throw new Error('user not found');
      const next: UserRecord = {
        ...user,
        username: input.username,
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? user.displayName,
        isGuest: false,
        updatedAt: new Date(),
      };
      users.set(id, next);
      return next;
    },
    async updateProfile(id, input) {
      const user = users.get(id);
      if (!user) throw new Error('user not found');
      const next: UserRecord = {
        ...user,
        displayName: input.displayName ?? user.displayName,
        avatar: input.avatar ?? user.avatar,
        updatedAt: new Date(),
      };
      users.set(id, next);
      return next;
    },
    async touchLastSeen(id) {
      const user = users.get(id);
      if (user) user.lastSeenAt = new Date();
    },
  };

  const statsRepo: StatsRepository = {
    async getStats(userId) {
      return { ...getStats(userId) };
    },
    async getManyStats(userIds) {
      return new Map(userIds.map((id) => [id, { ...getStats(id) }]));
    },
    async leaderboard(limit, offset = 0) {
      return [...stats.values()]
        .filter((s) => s.gamesPlayed > 0)
        .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
        .slice(offset, offset + limit)
        .map((s) => ({ user: users.get(s.userId)!, stats: s }));
    },
    async rankOf(userId) {
      const rows = await statsRepo.leaderboard(Number.MAX_SAFE_INTEGER);
      const idx = rows.findIndex((r) => r.stats.userId === userId);
      return idx === -1 ? null : idx + 1;
    },
  };

  const unlock = (userId: string, key: string, when: Date, unlocked: string[]): void => {
    let set = achievements.get(userId);
    if (!set) {
      set = new Map();
      achievements.set(userId, set);
    }
    if (!set.has(key)) {
      set.set(key, when);
      unlocked.push(key);
    }
  };

  const matchRepo: FakeMatchRepository = {
    calls: [],
    failWith: null,
    async recordMatch(input) {
      matchRepo.calls.push(structuredClone(input));
      if (matchRepo.failWith) throw matchRepo.failWith;
      if (input.endReason === 'CANCELLED') throw new Error('CANCELLED matches must not be recorded');
      const humans = input.participants.filter((p) => !p.isAi && p.userId);
      const ratingsBefore = new Map(humans.map((p) => [p.userId!, getStats(p.userId!).rating]));
      const outcomes: ParticipantOutcome[] = [];
      const participantRecords: MatchParticipantRecord[] = input.participants.map((p) => ({ ...p, ratingChange: null }));

      for (const p of humans) {
        const userId = p.userId!;
        const row = getStats(userId);
        const before = ratingsBefore.get(userId)!;
        const unlocked: string[] = [];
        let change = 0;
        if (input.mode === 'PRACTICE') {
          row.practiceGames += 1;
          if (p.won) row.practiceWins += 1;
          if (p.won && p.aiDifficulty === undefined) {
            const ai = input.participants.find((q) => q.isAi);
            if (ai?.aiDifficulty === 'hard') unlock(userId, 'admiral', input.endedAt, unlocked);
          }
        } else {
          const opponent = input.participants.find((q) => q !== p)!;
          const opponentRating = opponent.userId ? (ratingsBefore.get(opponent.userId) ?? DEFAULT_RATING) : DEFAULT_RATING;
          change = eloDelta(before, opponentRating, p.won ? 1 : 0);
          row.rating = before + change;
          row.gamesPlayed += 1;
          if (p.won) {
            row.wins += 1;
            row.currentStreak += 1;
            row.bestStreak = Math.max(row.bestStreak, row.currentStreak);
            if (row.wins === 1) unlock(userId, 'first_victory', input.endedAt, unlocked);
            if (p.shots > 0 && p.hits / p.shots >= 0.6) unlock(userId, 'sharpshooter', input.endedAt, unlocked);
            if (p.shipsLost === 0) unlock(userId, 'flawless', input.endedAt, unlocked);
            if (row.currentStreak >= 3) unlock(userId, 'hot_streak', input.endedAt, unlocked);
          } else {
            row.losses += 1;
            row.currentStreak = 0;
          }
        }
        row.shotsFired += p.shots;
        row.shotsHit += p.hits;
        row.shipsSunk += p.shipsSunk;
        row.updatedAt = input.endedAt;
        if (row.gamesPlayed + row.practiceGames >= 25) unlock(userId, 'veteran', input.endedAt, unlocked);
        const rec = participantRecords.find((r) => r.userId === userId);
        if (rec) rec.ratingChange = input.mode === 'PRACTICE' ? null : change;
        outcomes.push({ userId, ratingBefore: before, ratingChange: change, ratingAfter: before + change, achievementsUnlocked: unlocked });
      }

      matches.set(input.id, { ...input, participants: participantRecords });
      const outcome: MatchRecordOutcome = { participants: outcomes };
      return outcome;
    },
    async listForUser(userId, limit) {
      return [...matches.values()]
        .filter((m) => m.participants.some((p) => p.userId === userId))
        .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
        .slice(0, limit);
    },
    async findById(id) {
      return matches.get(id) ?? null;
    },
  };

  const achievementRepo: AchievementRepository = {
    async listForUser(userId) {
      const set = achievements.get(userId);
      if (!set) return [];
      return [...set.entries()]
        .filter(([key]) => ACHIEVEMENTS.some((a) => a.key === key))
        .map(([key, unlockedAt]) => ({ key, unlockedAt }));
    },
  };

  return {
    kind: 'memory',
    users: userRepo,
    stats: statsRepo,
    matches: matchRepo,
    achievements: achievementRepo,
    async healthCheck() {
      return true;
    },
    async close() {
      /* nothing to release */
    },
    addUser: (input) => makeUser(input),
    setRating(userId, rating) {
      getStats(userId).rating = rating;
    },
  };
}
