import type { Request, RequestHandler } from 'express';
import type { AppDeps } from '../deps';
import { AppError } from '../http/errors';
import type { UserRecord } from '../persistence/types';

/** lastSeenAt is refreshed at most this often per user to keep authenticated requests cheap. */
const TOUCH_INTERVAL_MS = 60_000;
const TOUCH_CACHE_MAX = 10_000;

interface RequestWithUser extends Request {
  authUser?: UserRecord;
}

/** The user attached by `requireAuth`. Throws 401 when the request was not authenticated. */
export function getAuthUser(req: Request): UserRecord {
  const user = (req as RequestWithUser).authUser;
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required');
  return user;
}

/** The user attached by `optionalAuth`, or null. */
export function getOptionalAuthUser(req: Request): UserRecord | null {
  return (req as RequestWithUser).authUser ?? null;
}

/** Extracts the token from an `Authorization: Bearer <token>` header (case-insensitive scheme). */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(/\s+/);
  const [scheme, token] = parts;
  if (parts.length !== 2 || !scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export interface AuthMiddleware {
  /** Rejects with 401 UNAUTHORIZED unless a valid token for an existing user is presented. */
  requireAuth: RequestHandler;
  /** Attaches the user when a valid token is presented; otherwise continues anonymously. */
  optionalAuth: RequestHandler;
}

export function createAuthMiddleware(deps: Pick<AppDeps, 'repos' | 'tokens' | 'logger'>): AuthMiddleware {
  const lastTouched = new Map<string, number>();

  const touch = (userId: string): void => {
    const now = Date.now();
    if (now - (lastTouched.get(userId) ?? 0) < TOUCH_INTERVAL_MS) return;
    if (lastTouched.size >= TOUCH_CACHE_MAX) lastTouched.clear();
    lastTouched.set(userId, now);
    void deps.repos.users.touchLastSeen(userId).catch((err: unknown) => {
      deps.logger.debug({ err, userId }, 'Failed to update lastSeenAt');
    });
  };

  const resolveUser = async (req: Request): Promise<{ user: UserRecord | null; tokenPresent: boolean }> => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return { user: null, tokenPresent: false };
    const claims = await deps.tokens.verify(token);
    if (!claims) return { user: null, tokenPresent: true };
    return { user: await deps.repos.users.findById(claims.userId), tokenPresent: true };
  };

  const requireAuth: RequestHandler = async (req, _res, next) => {
    try {
      const { user, tokenPresent } = await resolveUser(req);
      if (!user) {
        next(new AppError('UNAUTHORIZED', tokenPresent ? 'Invalid or expired token' : 'Authentication required'));
        return;
      }
      (req as RequestWithUser).authUser = user;
      touch(user.id);
      next();
    } catch (err) {
      next(err);
    }
  };

  const optionalAuth: RequestHandler = async (req, _res, next) => {
    try {
      const { user } = await resolveUser(req);
      if (user) {
        (req as RequestWithUser).authUser = user;
        touch(user.id);
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  return { requireAuth, optionalAuth };
}
