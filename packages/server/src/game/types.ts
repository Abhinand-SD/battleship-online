import type { AiDifficulty, ApiError, ErrorCode } from '@battleship/shared';
import type { UserRecord } from '../persistence/types';

/** Failure half of a `Result`; carries the wire-level `ApiError`. */
export interface Failure {
  ok: false;
  error: ApiError;
}

export type Result<T = void> = { ok: true; value: T } | Failure;

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function fail(code: ErrorCode, message: string, details?: unknown): Failure {
  return { ok: false, error: details === undefined ? { code, message } : { code, message, details } };
}

/** Everything the game needs to know about a human player when they enter a game. */
export interface PlayerProfile {
  userId: string;
  displayName: string;
  avatar: string;
  isGuest: boolean;
  rating: number;
}

export function profileFromRecord(user: UserRecord, rating: number): PlayerProfile {
  return { userId: user.id, displayName: user.displayName, avatar: user.avatar, isGuest: user.isGuest, rating };
}

/** Game timings in milliseconds (mirrors `AppConfig['timings']`). */
export interface GameTimings {
  lobbyCountdownMs: number;
  battleCountdownMs: number;
  turnTimeoutMs: number;
  maxConsecutiveTimeouts: number;
  reconnectGraceMs: number;
  placementTimeoutMs: number;
  aiMoveDelayMs: number;
}

/** Presentation of the built-in AI opponents. Names/avatars are persisted in match history. */
export const AI_PROFILES: Record<AiDifficulty, { displayName: string; avatar: string; rating: number }> = {
  easy: { displayName: 'Ensign Bot', avatar: 'radar', rating: 900 },
  medium: { displayName: 'Captain Bot', avatar: 'helm', rating: 1200 },
  hard: { displayName: 'Admiral Bot', avatar: 'kraken', rating: 1500 },
};

export const AI_PLAYER_ID = 'ai';
