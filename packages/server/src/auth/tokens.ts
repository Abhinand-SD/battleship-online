import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AppConfig } from '../config';
import type { TokenService } from '../deps';
import type { Logger } from '../logger';

export const TOKEN_ISSUER = 'battleship';
export const TOKEN_ALG = 'HS256';
const MAX_TOKEN_LENGTH = 4096;

/** Generated once per process when JWT_SECRET is missing outside production. */
let processSecret: string | null = null;
function ephemeralSecret(): string {
  if (!processSecret) processSecret = randomBytes(32).toString('hex');
  return processSecret;
}

/**
 * HS256 JWTs via jose. Tokens carry the user id as `sub`, an issuer and an expiry of JWT_TTL_DAYS.
 * Without JWT_SECRET the service refuses to start in production and otherwise falls back to a random
 * per-process secret (logged as a warning): sessions then do not survive a restart.
 */
export function createTokenService(
  config: Pick<AppConfig, 'JWT_SECRET' | 'JWT_TTL_DAYS' | 'isProduction'>,
  logger: Logger,
): TokenService {
  let secret = config.JWT_SECRET;
  if (!secret) {
    if (config.isProduction) throw new Error('JWT_SECRET must be set in production (at least 16 characters).');
    secret = ephemeralSecret();
    logger.warn(
      'JWT_SECRET is not set: signing tokens with a random secret generated for this process. Sessions will not survive a restart; set JWT_SECRET in .env to fix this.',
    );
  }
  const key = new TextEncoder().encode(secret);
  const ttlSeconds = Math.max(1, Math.round(config.JWT_TTL_DAYS * 86_400));

  return {
    async sign(userId) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: TOKEN_ALG, typ: 'JWT' })
        .setIssuer(TOKEN_ISSUER)
        .setSubject(userId)
        .setIssuedAt(now)
        .setExpirationTime(now + ttlSeconds)
        .sign(key);
    },

    async verify(token) {
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: [TOKEN_ALG], issuer: TOKEN_ISSUER });
        return typeof payload.sub === 'string' && payload.sub.length > 0 ? { userId: payload.sub } : null;
      } catch {
        return null;
      }
    },
  };
}
