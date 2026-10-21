import type { AiDifficulty, EndReason, GameMode } from '@battleship/shared';

export interface UserRecord {
  id: string;
  username: string | null;
  passwordHash: string | null;
  displayName: string;
  avatar: string;
  isGuest: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
}

export interface StatsRecord {
  userId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  shotsFired: number;
  shotsHit: number;
  shipsSunk: number;
  currentStreak: number;
  bestStreak: number;
  rating: number;
  practiceGames: number;
  practiceWins: number;
  updatedAt: Date;
}

export interface MatchParticipantInput {
  /** null for the AI opponent. */
  userId: string | null;
  isAi: boolean;
  aiDifficulty?: AiDifficulty;
  displayName: string;
  avatar: string;
  won: boolean;
  shots: number;
  hits: number;
  misses: number;
  shipsSunk: number;
  shipsLost: number;
}

export interface MatchRecordInput {
  id: string;
  mode: GameMode;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  winnerUserId: string | null;
  endReason: EndReason;
  totalMoves: number;
  participants: [MatchParticipantInput, MatchParticipantInput];
}

export interface ParticipantOutcome {
  userId: string;
  ratingBefore: number;
  ratingChange: number;
  ratingAfter: number;
  achievementsUnlocked: string[];
}

export interface MatchRecordOutcome {
  /** One entry per human participant. */
  participants: ParticipantOutcome[];
}

export interface MatchParticipantRecord extends MatchParticipantInput {
  ratingChange: number | null;
}

export interface MatchRecord {
  id: string;
  mode: GameMode;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  winnerUserId: string | null;
  endReason: EndReason;
  totalMoves: number;
  participants: MatchParticipantRecord[];
}

export interface UserRepository {
  createGuest(input: { displayName: string; avatar: string }): Promise<UserRecord>;
  createAccount(input: { username: string; passwordHash: string; displayName: string; avatar: string }): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  findManyByIds(ids: string[]): Promise<UserRecord[]>;
  findByUsername(username: string): Promise<UserRecord | null>;
  /** Converts a guest into a registered account, keeping id, stats and history. */
  upgradeToAccount(id: string, input: { username: string; passwordHash: string; displayName?: string }): Promise<UserRecord>;
  updateProfile(id: string, input: { displayName?: string; avatar?: string }): Promise<UserRecord>;
  touchLastSeen(id: string): Promise<void>;
}

export interface StatsRepository {
  /** Returns the stats row, creating a default one when missing. */
  getStats(userId: string): Promise<StatsRecord>;
  getManyStats(userIds: string[]): Promise<Map<string, StatsRecord>>;
  /** Players with at least one online game, ordered by rating desc, wins desc. */
  leaderboard(limit: number, offset?: number): Promise<Array<{ user: UserRecord; stats: StatsRecord }>>;
  /** 1-based rank of the user on the leaderboard, or null when unranked. */
  rankOf(userId: string): Promise<number | null>;
}

export interface MatchRepository {
  /**
   * Persists the match and both participants, updates each human participant's stats
   * (games, wins/losses, accuracy counters, streaks, Elo rating for online modes) and unlocks achievements.
   * Must be atomic per implementation. Matches with endReason CANCELLED are never recorded.
   */
  recordMatch(input: MatchRecordInput): Promise<MatchRecordOutcome>;
  listForUser(userId: string, limit: number): Promise<MatchRecord[]>;
  findById(id: string): Promise<MatchRecord | null>;
}

export interface AchievementRepository {
  listForUser(userId: string): Promise<Array<{ key: string; unlockedAt: Date }>>;
}

export interface Repositories {
  kind: 'prisma' | 'memory';
  users: UserRepository;
  stats: StatsRepository;
  matches: MatchRepository;
  achievements: AchievementRepository;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}
