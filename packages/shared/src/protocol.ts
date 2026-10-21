import { z } from 'zod';
import {
  AVATAR_IDS,
  BOARD_SIZE,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SHIP_TYPES,
} from './constants';
import type { AiDifficulty, Fleet, GameEvent, GameSnapshot, QueueStatus, SessionState } from './types';

// ---------------------------------------------------------------------------
// Error codes shared by REST and socket responses
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_PAYLOAD',
  'RATE_LIMITED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ALREADY_IN_GAME',
  'NOT_IN_GAME',
  'ALREADY_IN_QUEUE',
  'NOT_IN_QUEUE',
  'WRONG_PHASE',
  'NOT_YOUR_TURN',
  'CELL_ALREADY_ATTACKED',
  'STALE_MOVE',
  'INVALID_FLEET',
  'FLEET_LOCKED',
  'OPPONENT_LEFT',
  'USERNAME_TAKEN',
  'INVALID_CREDENTIALS',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** Every socket request is acknowledged with one of these. */
export type AckResponse<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: ApiError };
export type Ack<T = Record<string, never>> = (response: AckResponse<T>) => void;

// ---------------------------------------------------------------------------
// Zod schemas (server-side validation of untrusted input)
// ---------------------------------------------------------------------------

export const coordSchema = z.object({
  x: z.number().int().min(0).max(BOARD_SIZE - 1),
  y: z.number().int().min(0).max(BOARD_SIZE - 1),
});

export const shipPlacementSchema = z.object({
  type: z.enum(SHIP_TYPES),
  x: z.number().int().min(0).max(BOARD_SIZE - 1),
  y: z.number().int().min(0).max(BOARD_SIZE - 1),
  orientation: z.enum(['horizontal', 'vertical']),
});

/** Structural check only; use `validateFleet` from the engine for rule validation. */
export const fleetSchema = z.array(shipPlacementSchema).length(SHIP_TYPES.length);

export const roomCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(ROOM_CODE_LENGTH).regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`)));

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN)
  .max(DISPLAY_NAME_MAX)
  .regex(/^[\p{L}\p{N} _.\-']+$/u, 'Display name contains unsupported characters');

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 characters: letters, numbers, underscore');

export const passwordSchema = z.string().min(8).max(128);

export const avatarSchema = z.enum(AVATAR_IDS);

export const roomCreatePayloadSchema = z.object({}).optional();
export const roomJoinPayloadSchema = z.object({ code: roomCodeSchema });
export const roomReadyPayloadSchema = z.object({ ready: z.boolean() });
export const practiceStartPayloadSchema = z.object({ difficulty: difficultySchema });
export const fleetConfirmPayloadSchema = z.object({ fleet: fleetSchema });
export const attackPayloadSchema = z.object({
  x: z.number().int().min(0).max(BOARD_SIZE - 1),
  y: z.number().int().min(0).max(BOARD_SIZE - 1),
  /** The move number the client believes it is making; protects against duplicate / stale events. */
  moveNumber: z.number().int().min(1),
});
export const rematchPayloadSchema = z.object({ accept: z.boolean() });

export const registerPayloadSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});
export const loginPayloadSchema = z.object({ username: usernameSchema, password: passwordSchema });
export const guestPayloadSchema = z.object({ displayName: displayNameSchema.optional() }).optional();
export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatar: avatarSchema.optional(),
});

// ---------------------------------------------------------------------------
// Socket.IO typed event maps
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  /** Request the current session state (also sent automatically on connect). */
  'session:sync': (ack: Ack<{ state: SessionState }>) => void;

  'room:create': (ack: Ack<{ code: string; game: GameSnapshot }>) => void;
  'room:join': (payload: { code: string }, ack: Ack<{ code: string; game: GameSnapshot }>) => void;
  'room:ready': (payload: { ready: boolean }, ack: Ack) => void;

  'queue:join': (ack: Ack<{ status: QueueStatus }>) => void;
  'queue:leave': (ack: Ack<{ status: QueueStatus }>) => void;

  'practice:start': (payload: { difficulty: AiDifficulty }, ack: Ack<{ game: GameSnapshot }>) => void;

  'fleet:confirm': (payload: { fleet: Fleet }, ack: Ack) => void;

  'game:attack': (
    payload: { x: number; y: number; moveNumber: number },
    ack: Ack<{ outcome: 'miss' | 'hit' | 'sunk'; gameOver: boolean }>,
  ) => void;
  'game:forfeit': (ack: Ack) => void;
  'game:rematch': (payload: { accept: boolean }, ack: Ack) => void;
  /** Leave the current game/room (forfeits an active battle). */
  'game:leave': (ack: Ack) => void;
}

export interface ServerToClientEvents {
  'session:state': (state: SessionState) => void;
  'game:state': (snapshot: GameSnapshot) => void;
  'game:event': (event: GameEvent) => void;
  'game:closed': (payload: { gameId: string; reason: string }) => void;
  'queue:status': (status: QueueStatus) => void;
  'server:error': (error: ApiError) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}

// ---------------------------------------------------------------------------
// REST API shapes
// ---------------------------------------------------------------------------

export const API_PREFIX = '/api';

export interface AuthResponse {
  token: string;
  user: import('./types').UserProfile;
}
