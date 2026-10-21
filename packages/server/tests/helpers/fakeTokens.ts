import type { TokenService } from '../../src/deps';

const PREFIX = 'test-token.';

export interface FakeTokenService extends TokenService {
  /** The token `verify` accepts for this user. */
  tokenFor(userId: string): string;
  /** Tokens explicitly revoked (verify returns null). */
  revoked: Set<string>;
}

/** Deterministic token service for tests: tokens are `test-token.<userId>`. */
export function createFakeTokens(): FakeTokenService {
  const revoked = new Set<string>();
  return {
    revoked,
    tokenFor: (userId) => `${PREFIX}${userId}`,
    async sign(userId) {
      return `${PREFIX}${userId}`;
    },
    async verify(token) {
      if (typeof token !== 'string' || !token.startsWith(PREFIX) || revoked.has(token)) return null;
      const userId = token.slice(PREFIX.length);
      return userId ? { userId } : null;
    },
  };
}
