import http from 'node:http';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createRepositories } from './persistence';
import { createTokenService } from './auth/tokens';
import { createHttpApp } from './http/app';
import { createRealtime } from './realtime';
import type { AppDeps } from './deps';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const repos = await createRepositories(config, logger);
  const tokens = createTokenService(config, logger);
  const deps: AppDeps = {
    config,
    logger,
    repos,
    tokens,
    runtime: { stats: () => ({ connectedSockets: 0, onlineUsers: 0, activeGames: 0, queueLength: 0 }) },
  };

  const app = createHttpApp(deps);
  const server = http.createServer(app);
  const realtime = createRealtime(server, deps);
  deps.runtime.stats = () => realtime.stats();

  await new Promise<void>((resolve) => server.listen(config.PORT, config.HOST, resolve));
  logger.info(
    { port: config.PORT, host: config.HOST, store: repos.kind, env: config.NODE_ENV },
    `Battleship server listening on http://${config.HOST}:${config.PORT}`,
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    try {
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await repos.close();
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
