/**
 * In-memory repositories. Used when DATABASE_URL is not configured (local development, tests).
 * Everything lives in process memory and is lost on restart. Records handed out are copies, so callers
 * cannot mutate the store by accident.
 */
import type { Logger } from '../../logger';
import { RecordNotFoundError, UsernameTakenError } from '../errors';
import { newId } from '../ids';
import {
  compareLeaderboard,
  computeMatchOutcome,
  defaultStatsRecord,
  humanParticipants,
  isRanked,
  shouldRecordMatch,
  toMatchRecordOutcome,
  type ParticipantSnapshot,
} from '../statsLogic';
import type {
  AchievementRepository,
  MatchRecord,
  MatchRecordInput,
  MatchRecordOutcome,
  MatchRepository,
  Repositories,
  StatsRecord,
  StatsRepository,
  UserRecord,
  UserRepository,
} from '../types';

const cloneUser = (u: UserRecord): UserRecord => ({ ...u });
const cloneStats = (s: StatsRecord): StatsRecord => ({ ...s });
const cloneMatch = (m: MatchRecord): MatchRecord => ({ ...m, participants: m.participants.map((p) => ({ ...p })) });

export function createMemoryRepositories(logger: Logger): Repositories {
  const users = new Map<string, UserRecord>();
  /** username (lower-case) -> user id */
  const usernames = new Map<string, string>();
  const stats = new Map<string, StatsRecord>();
  const matches = new Map<string, MatchRecord>();
  /** user id -> match ids in insertion order */
  const matchesByUser = new Map<string, string[]>();
  /** user id -> achievement key -> unlockedAt */
  const unlocked = new Map<string, Map<string, Date>>();

  const requireUser = (id: string): UserRecord => {
    const user = users.get(id);
    if (!user) throw new RecordNotFoundError('User', id);
    return user;
  };

  const ensureStats = (userId: string): StatsRecord => {
    let row = stats.get(userId);
    if (!row) {
      row = defaultStatsRecord(userId);
      stats.set(userId, row);
    }
    return row;
  };

  const rankedRows = (): StatsRecord[] => [...stats.values()].filter(isRanked).sort(compareLeaderboard);

  const userRepo: UserRepository = {
    async createGuest(input) {
      const now = new Date();
      const user: UserRecord = {
        id: newId(),
        username: null,
        passwordHash: null,
        displayName: input.displayName,
        avatar: input.avatar,
        isGuest: true,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };
      users.set(user.id, user);
      return cloneUser(user);
    },

    async createAccount(input) {
      const username = input.username.toLowerCase();
      if (usernames.has(username)) throw new UsernameTakenError(username);
      const now = new Date();
      const user: UserRecord = {
        id: newId(),
        username,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        avatar: input.avatar,
        isGuest: false,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };
      users.set(user.id, user);
      usernames.set(username, user.id);
      return cloneUser(user);
    },

    async findById(id) {
      const user = users.get(id);
      return user ? cloneUser(user) : null;
    },

    async findManyByIds(ids) {
      const out: UserRecord[] = [];
      for (const id of new Set(ids)) {
        const user = users.get(id);
        if (user) out.push(cloneUser(user));
      }
      return out;
    },

    async findByUsername(username) {
      const id = usernames.get(username.toLowerCase());
      const user = id ? users.get(id) : undefined;
      return user ? cloneUser(user) : null;
    },

    async upgradeToAccount(id, input) {
      const user = requireUser(id);
      const username = input.username.toLowerCase();
      const owner = usernames.get(username);
      if (owner !== undefined && owner !== id) throw new UsernameTakenError(username);
      if (user.username) usernames.delete(user.username);
      user.username = username;
      user.passwordHash = input.passwordHash;
      user.isGuest = false;
      if (input.displayName !== undefined) user.displayName = input.displayName;
      user.updatedAt = new Date();
      usernames.set(username, id);
      return cloneUser(user);
    },

    async updateProfile(id, input) {
      const user = requireUser(id);
      if (input.displayName !== undefined) user.displayName = input.displayName;
      if (input.avatar !== undefined) user.avatar = input.avatar;
      user.updatedAt = new Date();
      return cloneUser(user);
    },

    async touchLastSeen(id) {
      const user = users.get(id);
      if (user) user.lastSeenAt = new Date();
    },
  };

  const statsRepo: StatsRepository = {
    async getStats(userId) {
      const row = stats.get(userId);
      if (row) return cloneStats(row);
      // Only persist a default row for known users; unknown ids get a transient default.
      return users.has(userId) ? cloneStats(ensureStats(userId)) : defaultStatsRecord(userId);
    },

    async getManyStats(userIds) {
      const out = new Map<string, StatsRecord>();
      for (const id of new Set(userIds)) {
        const row = stats.get(id);
        out.set(id, row ? cloneStats(row) : defaultStatsRecord(id));
      }
      return out;
    },

    async leaderboard(limit, offset = 0) {
      const out: Array<{ user: UserRecord; stats: StatsRecord }> = [];
      for (const row of rankedRows().slice(offset, offset + limit)) {
        const user = users.get(row.userId);
        if (user) out.push({ user: cloneUser(user), stats: cloneStats(row) });
      }
      return out;
    },

    async rankOf(userId) {
      const index = rankedRows().findIndex((row) => row.userId === userId);
      return index === -1 ? null : index + 1;
    },
  };

  const matchRepo: MatchRepository = {
    async recordMatch(input: MatchRecordInput): Promise<MatchRecordOutcome> {
      if (!shouldRecordMatch(input)) {
        logger.warn({ matchId: input.id, endReason: input.endReason }, 'Ignoring cancelled match; nothing recorded');
        return { participants: [] };
      }
      if (matches.has(input.id)) {
        logger.warn({ matchId: input.id }, 'Match already recorded; ignoring duplicate');
        return { participants: [] };
      }

      const humans = humanParticipants(input);
      const snapshots = new Map<string, ParticipantSnapshot>();
      for (const human of humans) {
        requireUser(human.userId);
        snapshots.set(human.userId, {
          stats: ensureStats(human.userId),
          unlocked: new Set(unlocked.get(human.userId)?.keys() ?? []),
        });
      }

      const computed = computeMatchOutcome(input, snapshots);
      const byUser = new Map(computed.map((c) => [c.userId, c] as const));
      const now = new Date();

      const record: MatchRecord = {
        id: input.id,
        mode: input.mode,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationMs: input.durationMs,
        winnerUserId: input.winnerUserId,
        endReason: input.endReason,
        totalMoves: input.totalMoves,
        participants: input.participants.map((p) => ({
          ...p,
          ratingChange: p.userId ? (byUser.get(p.userId)?.ratingChange ?? null) : null,
        })),
      };
      matches.set(record.id, record);
      for (const human of humans) {
        const list = matchesByUser.get(human.userId) ?? [];
        list.push(record.id);
        matchesByUser.set(human.userId, list);
      }

      for (const c of computed) {
        stats.set(c.userId, { userId: c.userId, ...c.statsAfter, updatedAt: now });
        if (c.achievementsUnlocked.length > 0) {
          const mine = unlocked.get(c.userId) ?? new Map<string, Date>();
          for (const key of c.achievementsUnlocked) mine.set(key, now);
          unlocked.set(c.userId, mine);
        }
      }
      return toMatchRecordOutcome(computed);
    },

    async listForUser(userId, limit) {
      const ids = matchesByUser.get(userId) ?? [];
      const records: MatchRecord[] = [];
      for (const id of ids) {
        const match = matches.get(id);
        if (match) records.push(match);
      }
      // Most recent first; insertion order breaks ties.
      return records
        .map((match, index) => ({ match, index }))
        .sort((a, b) => b.match.endedAt.getTime() - a.match.endedAt.getTime() || b.index - a.index)
        .slice(0, Math.max(0, limit))
        .map(({ match }) => cloneMatch(match));
    },

    async findById(id) {
      const match = matches.get(id);
      return match ? cloneMatch(match) : null;
    },
  };

  const achievementRepo: AchievementRepository = {
    async listForUser(userId) {
      const mine = unlocked.get(userId);
      if (!mine) return [];
      return [...mine.entries()]
        .map(([key, unlockedAt]) => ({ key, unlockedAt }))
        .sort((a, b) => a.unlockedAt.getTime() - b.unlockedAt.getTime());
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
      // Nothing to release.
    },
  };
}
