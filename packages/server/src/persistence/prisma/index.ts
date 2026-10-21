/**
 * Prisma + PostgreSQL repositories. Constructed with the pg driver adapter (Prisma 7).
 * Match recording runs in a single interactive transaction that locks the participants' stats rows.
 */
import { ACHIEVEMENTS } from '@battleship/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { Logger } from '../../logger';
import { RecordNotFoundError, UsernameTakenError } from '../errors';
import { newId } from '../ids';
import {
  computeMatchOutcome,
  defaultStatsRecord,
  humanParticipants,
  shouldRecordMatch,
  toMatchRecordOutcome,
  type ParticipantSnapshot,
} from '../statsLogic';
import type {
  AchievementRepository,
  MatchRecordInput,
  MatchRecordOutcome,
  MatchRepository,
  Repositories,
  StatsRecord,
  StatsRepository,
  UserRepository,
} from '../types';
import { toMatchRecord, toStatsRecord, toUserRecord } from './mappers';

/** Prisma error codes we translate into domain errors. */
const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

function prismaErrorCode(err: unknown): string | null {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
}

export function createPrismaClient(connectionString: string, logger: Logger): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString },
    {
      onPoolError: (err) => logger.error({ err }, 'PostgreSQL pool error'),
      onConnectionError: (err) => logger.error({ err }, 'PostgreSQL connection error'),
    },
  );
  return new PrismaClient({ adapter, log: ['warn', 'error'] });
}

/** Makes sure every achievement definition from @battleship/shared exists (upsert, idempotent). */
export async function seedAchievements(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    ACHIEVEMENTS.map((a) =>
      prisma.achievement.upsert({
        where: { key: a.key },
        update: { name: a.name, description: a.description },
        create: { key: a.key, name: a.name, description: a.description },
      }),
    ),
  );
}

export async function createPrismaRepositories(connectionString: string, logger: Logger): Promise<Repositories> {
  const prisma = createPrismaClient(connectionString, logger);
  await prisma.$connect();
  try {
    await seedAchievements(prisma);
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    throw err;
  }
  return buildRepositories(prisma, logger);
}

export function buildRepositories(prisma: PrismaClient, logger: Logger): Repositories {
  const users: UserRepository = {
    async createGuest(input) {
      const user = await prisma.user.create({
        data: { id: newId(), displayName: input.displayName, avatar: input.avatar, isGuest: true },
      });
      return toUserRecord(user);
    },

    async createAccount(input) {
      const username = input.username.toLowerCase();
      try {
        const user = await prisma.user.create({
          data: {
            id: newId(),
            username,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            avatar: input.avatar,
            isGuest: false,
          },
        });
        return toUserRecord(user);
      } catch (err) {
        if (prismaErrorCode(err) === UNIQUE_VIOLATION) throw new UsernameTakenError(username);
        throw err;
      }
    },

    async findById(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toUserRecord(user) : null;
    },

    async findManyByIds(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return [];
      const rows = await prisma.user.findMany({ where: { id: { in: unique } } });
      return rows.map(toUserRecord);
    },

    async findByUsername(username) {
      const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
      return user ? toUserRecord(user) : null;
    },

    async upgradeToAccount(id, input) {
      const username = input.username.toLowerCase();
      try {
        const user = await prisma.user.update({
          where: { id },
          data: { username, passwordHash: input.passwordHash, isGuest: false, displayName: input.displayName },
        });
        return toUserRecord(user);
      } catch (err) {
        const code = prismaErrorCode(err);
        if (code === UNIQUE_VIOLATION) throw new UsernameTakenError(username);
        if (code === RECORD_NOT_FOUND) throw new RecordNotFoundError('User', id);
        throw err;
      }
    },

    async updateProfile(id, input) {
      try {
        const user = await prisma.user.update({
          where: { id },
          data: { displayName: input.displayName, avatar: input.avatar },
        });
        return toUserRecord(user);
      } catch (err) {
        if (prismaErrorCode(err) === RECORD_NOT_FOUND) throw new RecordNotFoundError('User', id);
        throw err;
      }
    },

    async touchLastSeen(id) {
      await prisma.user.updateMany({ where: { id }, data: { lastSeenAt: new Date() } });
    },
  };

  const stats: StatsRepository = {
    async getStats(userId) {
      const row = await prisma.playerStats.findUnique({ where: { userId } });
      if (row) return toStatsRecord(row);
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      // Unknown users get a transient default; known users get a persisted default row.
      if (!user) return defaultStatsRecord(userId);
      try {
        return toStatsRecord(await prisma.playerStats.create({ data: { userId } }));
      } catch (err) {
        if (prismaErrorCode(err) === UNIQUE_VIOLATION) {
          const again = await prisma.playerStats.findUnique({ where: { userId } });
          if (again) return toStatsRecord(again);
        }
        throw err;
      }
    },

    async getManyStats(userIds) {
      const out = new Map<string, StatsRecord>();
      const unique = [...new Set(userIds)];
      if (unique.length === 0) return out;
      for (const id of unique) out.set(id, defaultStatsRecord(id));
      const rows = await prisma.playerStats.findMany({ where: { userId: { in: unique } } });
      for (const row of rows) out.set(row.userId, toStatsRecord(row));
      return out;
    },

    async leaderboard(limit, offset = 0) {
      if (limit <= 0) return [];
      const rows = await prisma.playerStats.findMany({
        where: { gamesPlayed: { gte: 1 } },
        orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { userId: 'asc' }],
        skip: Math.max(0, offset),
        take: limit,
        include: { user: true },
      });
      return rows.map((row) => ({ user: toUserRecord(row.user), stats: toStatsRecord(row) }));
    },

    async rankOf(userId) {
      const row = await prisma.playerStats.findUnique({ where: { userId } });
      if (!row || row.gamesPlayed < 1) return null;
      const ahead = await prisma.playerStats.count({
        where: {
          gamesPlayed: { gte: 1 },
          OR: [
            { rating: { gt: row.rating } },
            { rating: row.rating, wins: { gt: row.wins } },
            { rating: row.rating, wins: row.wins, userId: { lt: userId } },
          ],
        },
      });
      return ahead + 1;
    },
  };

  const matches: MatchRepository = {
    async recordMatch(input: MatchRecordInput): Promise<MatchRecordOutcome> {
      if (!shouldRecordMatch(input)) {
        logger.warn({ matchId: input.id, endReason: input.endReason }, 'Ignoring cancelled match; nothing recorded');
        return { participants: [] };
      }
      const humans = humanParticipants(input);
      const humanIds = [...new Set(humans.map((h) => h.userId))];

      return prisma.$transaction(
        async (tx) => {
          const existing = await tx.match.findUnique({ where: { id: input.id }, select: { id: true } });
          if (existing) {
            logger.warn({ matchId: input.id }, 'Match already recorded; ignoring duplicate');
            return { participants: [] };
          }

          const snapshots = new Map<string, ParticipantSnapshot>();
          if (humanIds.length > 0) {
            // Make sure every human has a stats row, then lock those rows for the rest of the transaction
            // so two matches finishing at once for the same player cannot overwrite each other's update.
            for (const userId of humanIds) {
              await tx.playerStats.upsert({ where: { userId }, update: {}, create: { userId } });
            }
            await tx.$executeRaw`SELECT "userId" FROM "PlayerStats" WHERE "userId" IN (${Prisma.join(humanIds)}) FOR UPDATE`;
            const rows = await tx.playerStats.findMany({ where: { userId: { in: humanIds } } });
            const unlockedRows = await tx.userAchievement.findMany({
              where: { userId: { in: humanIds } },
              select: { userId: true, key: true },
            });
            for (const row of rows) {
              snapshots.set(row.userId, {
                stats: toStatsRecord(row),
                unlocked: new Set(unlockedRows.filter((u) => u.userId === row.userId).map((u) => u.key)),
              });
            }
          }

          const computed = computeMatchOutcome(input, snapshots);
          const byUser = new Map(computed.map((c) => [c.userId, c] as const));

          await tx.match.create({
            data: {
              id: input.id,
              mode: input.mode,
              startedAt: input.startedAt,
              endedAt: input.endedAt,
              durationMs: input.durationMs,
              winnerUserId: input.winnerUserId,
              endReason: input.endReason,
              totalMoves: input.totalMoves,
              participants: {
                create: input.participants.map((p) => ({
                  id: newId(),
                  userId: p.userId,
                  isAi: p.isAi,
                  aiDifficulty: p.aiDifficulty ?? null,
                  displayName: p.displayName,
                  avatar: p.avatar,
                  won: p.won,
                  shots: p.shots,
                  hits: p.hits,
                  misses: p.misses,
                  shipsSunk: p.shipsSunk,
                  shipsLost: p.shipsLost,
                  ratingChange: p.userId ? (byUser.get(p.userId)?.ratingChange ?? null) : null,
                })),
              },
            },
          });

          for (const c of computed) {
            const s = c.statsAfter;
            await tx.playerStats.update({
              where: { userId: c.userId },
              data: {
                gamesPlayed: s.gamesPlayed,
                wins: s.wins,
                losses: s.losses,
                shotsFired: s.shotsFired,
                shotsHit: s.shotsHit,
                shipsSunk: s.shipsSunk,
                currentStreak: s.currentStreak,
                bestStreak: s.bestStreak,
                rating: s.rating,
                practiceGames: s.practiceGames,
                practiceWins: s.practiceWins,
              },
            });
          }

          const unlocks = computed.flatMap((c) => c.achievementsUnlocked.map((key) => ({ userId: c.userId, key })));
          if (unlocks.length > 0) {
            await tx.userAchievement.createMany({ data: unlocks, skipDuplicates: true });
          }
          return toMatchRecordOutcome(computed);
        },
        { maxWait: 5_000, timeout: 15_000 },
      );
    },

    async listForUser(userId, limit) {
      if (limit <= 0) return [];
      const rows = await prisma.match.findMany({
        where: { participants: { some: { userId } } },
        orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        include: { participants: true },
      });
      return rows.map(toMatchRecord);
    },

    async findById(id) {
      const row = await prisma.match.findUnique({ where: { id }, include: { participants: true } });
      return row ? toMatchRecord(row) : null;
    },
  };

  const achievements: AchievementRepository = {
    async listForUser(userId) {
      return prisma.userAchievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'asc' },
        select: { key: true, unlockedAt: true },
      });
    },
  };

  return {
    kind: 'prisma',
    users,
    stats,
    matches,
    achievements,
    async healthCheck() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (err) {
        logger.warn({ err }, 'Database health check failed');
        return false;
      }
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}
