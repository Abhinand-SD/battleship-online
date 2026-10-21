import type { ApiError, ErrorCode } from '@battleship/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_PAYLOAD: 400,
  RATE_LIMITED: 429,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  ALREADY_IN_GAME: 409,
  NOT_IN_GAME: 409,
  ALREADY_IN_QUEUE: 409,
  NOT_IN_QUEUE: 409,
  WRONG_PHASE: 409,
  NOT_YOUR_TURN: 409,
  CELL_ALREADY_ATTACKED: 409,
  STALE_MOVE: 409,
  INVALID_FLEET: 400,
  FLEET_LOCKED: 409,
  OPPONENT_LEFT: 409,
  USERNAME_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** An error with a shared ApiError code; the error handler turns it into `{ error: { code, message, details? } }`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, options: { status?: number; details?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? statusForCode(code);
    this.details = options.details;
  }

  toApiError(): ApiError {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}
