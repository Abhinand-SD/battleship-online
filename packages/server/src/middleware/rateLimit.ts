import type { ApiError } from '@battleship/shared';
import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../config';

export interface RateLimiters {
  /** Applied to every /api request. */
  api: RequestHandler;
  /** Stricter limiter for /api/auth/* (credential guessing, guest spam). */
  auth: RequestHandler;
}

function createLimiter(options: { windowMs: number; limit: number; scope: string }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const retryAfterMs = resetTime ? Math.max(0, resetTime.getTime() - Date.now()) : options.windowMs;
      const error: ApiError = {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down and try again shortly.',
        details: { scope: options.scope, retryAfterMs },
      };
      res.status(429).json({ error });
    },
  });
}

export function createRateLimiters(
  config: Pick<AppConfig, 'RATE_LIMIT_WINDOW_MS' | 'RATE_LIMIT_MAX' | 'AUTH_RATE_LIMIT_MAX'>,
): RateLimiters {
  return {
    api: createLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.RATE_LIMIT_MAX, scope: 'api' }),
    auth: createLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, limit: config.AUTH_RATE_LIMIT_MAX, scope: 'auth' }),
  };
}
