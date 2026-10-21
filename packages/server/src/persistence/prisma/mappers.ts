import type { AiDifficulty } from '@battleship/shared';
import type {
  Match as PrismaMatch,
  MatchParticipant as PrismaParticipant,
  PlayerStats as PrismaStats,
  User as PrismaUser,
} from '../../generated/prisma/client';
import type { MatchParticipantRecord, MatchRecord, StatsRecord, UserRecord } from '../types';

const AI_DIFFICULTIES: ReadonlySet<string> = new Set<AiDifficulty>(['easy', 'medium', 'hard']);

function toAiDifficulty(value: string | null): AiDifficulty | undefined {
  return value !== null && AI_DIFFICULTIES.has(value) ? (value as AiDifficulty) : undefined;
}

export function toUserRecord(u: PrismaUser): UserRecord {
  return {
    id: u.id,
    username: u.username,
    passwordHash: u.passwordHash,
    displayName: u.displayName,
    avatar: u.avatar,
    isGuest: u.isGuest,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastSeenAt: u.lastSeenAt,
  };
}

export function toStatsRecord(s: PrismaStats): StatsRecord {
  return {
    userId: s.userId,
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
    updatedAt: s.updatedAt,
  };
}

export function toParticipantRecord(p: PrismaParticipant): MatchParticipantRecord {
  const aiDifficulty = toAiDifficulty(p.aiDifficulty);
  return {
    userId: p.userId,
    isAi: p.isAi,
    ...(aiDifficulty ? { aiDifficulty } : {}),
    displayName: p.displayName,
    avatar: p.avatar,
    won: p.won,
    shots: p.shots,
    hits: p.hits,
    misses: p.misses,
    shipsSunk: p.shipsSunk,
    shipsLost: p.shipsLost,
    ratingChange: p.ratingChange,
  };
}

export function toMatchRecord(m: PrismaMatch & { participants: PrismaParticipant[] }): MatchRecord {
  return {
    id: m.id,
    mode: m.mode,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationMs: m.durationMs,
    winnerUserId: m.winnerUserId,
    endReason: m.endReason,
    totalMoves: m.totalMoves,
    participants: m.participants.map(toParticipantRecord),
  };
}
