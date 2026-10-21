import type { AppConfig } from './config';
import type { Logger } from './logger';
import type { Repositories } from './persistence/types';

export interface TokenService {
  /** Signs a JWT for the user. */
  sign(userId: string): Promise<string>;
  /** Returns the user id for a valid, unexpired token, or null. */
  verify(token: string): Promise<{ userId: string } | null>;
}

export interface RuntimeStats {
  connectedSockets: number;
  onlineUsers: number;
  activeGames: number;
  queueLength: number;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  repos: Repositories;
  tokens: TokenService;
  /** Populated by the realtime layer once it is attached; used by /api/health and /api/stats/online. */
  runtime: { stats: () => RuntimeStats };
}
