import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import { createMemoryRepositories } from './memory';
import type { Repositories } from './types';

export type * from './types';
export { createMemoryRepositories } from './memory';
export { RecordNotFoundError, UsernameTakenError } from './errors';

/**
 * Builds the repositories for the configured store: Prisma + PostgreSQL when DATABASE_URL is set,
 * otherwise the in-memory store (with a warning, since all data is lost on restart).
 * The Prisma module is loaded lazily so the in-memory path never touches the generated client.
 */
export async function createRepositories(
  config: Pick<AppConfig, 'DATABASE_URL' | 'NODE_ENV' | 'isProduction'>,
  logger: Logger,
): Promise<Repositories> {
  if (config.DATABASE_URL) {
    const { createPrismaRepositories } = await import('./prisma');
    const repos = await createPrismaRepositories(config.DATABASE_URL, logger);
    logger.info({ store: repos.kind }, 'Connected to PostgreSQL');
    return repos;
  }
  logger.warn(
    { store: 'memory', env: config.NODE_ENV },
    'DATABASE_URL is not set: using the in-memory store. Accounts, stats and match history are ephemeral and will be lost on restart.',
  );
  return createMemoryRepositories(logger);
}
