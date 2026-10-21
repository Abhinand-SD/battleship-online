import type { AuthResponse, UserProfile } from '@battleship/shared';
import type { AppDeps } from '../deps';
import { AppError } from '../http/errors';
import { UsernameTakenError } from '../persistence/errors';
import type { UserRecord } from '../persistence/types';
import { randomAvatar, randomCallSign } from './names';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords';

export interface RegisterInput {
  username: string;
  password: string;
  displayName?: string | undefined;
}

export interface AuthService {
  /** Creates a guest account (random call sign and avatar unless a display name is given). */
  createGuest(input?: { displayName?: string | undefined }): Promise<AuthResponse>;
  /**
   * Registers a username/password account. When `currentUser` is a guest (from a valid bearer token)
   * that guest is upgraded in place, keeping its id, stats and history.
   */
  register(input: RegisterInput, options?: { currentUser?: UserRecord | null }): Promise<AuthResponse>;
  login(input: { username: string; password: string }): Promise<AuthResponse>;
}

/** The public profile shape shared with clients. Never includes the password hash. */
export function toUserProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    isGuest: user.isGuest,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createAuthService(deps: Pick<AppDeps, 'repos' | 'tokens' | 'logger'>): AuthService {
  const { repos, tokens, logger } = deps;

  const respond = async (user: UserRecord): Promise<AuthResponse> => ({
    token: await tokens.sign(user.id),
    user: toUserProfile(user),
  });

  return {
    async createGuest(input = {}) {
      const user = await repos.users.createGuest({
        displayName: input.displayName ?? randomCallSign(),
        avatar: randomAvatar(),
      });
      logger.debug({ userId: user.id }, 'Guest account created');
      return respond(user);
    },

    async register(input, options = {}) {
      const username = input.username.toLowerCase();
      const current = options.currentUser ?? null;
      if (current && !current.isGuest) {
        throw new AppError('INVALID_PAYLOAD', 'Already registered');
      }
      if (await repos.users.findByUsername(username)) {
        throw new AppError('USERNAME_TAKEN', 'That username is already taken');
      }
      const passwordHash = await hashPassword(input.password);
      try {
        const user = current
          ? await repos.users.upgradeToAccount(current.id, { username, passwordHash, displayName: input.displayName })
          : await repos.users.createAccount({
              username,
              passwordHash,
              displayName: input.displayName ?? randomCallSign(),
              avatar: randomAvatar(),
            });
        logger.info({ userId: user.id, upgraded: current !== null }, 'Account registered');
        return respond(user);
      } catch (err) {
        if (err instanceof UsernameTakenError) throw new AppError('USERNAME_TAKEN', 'That username is already taken');
        throw err;
      }
    },

    async login(input) {
      const user = await repos.users.findByUsername(input.username.toLowerCase());
      if (!user) {
        await burnPasswordCheck(input.password);
        throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
      }
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password');
      }
      await repos.users.touchLastSeen(user.id);
      return respond(user);
    },
  };
}
