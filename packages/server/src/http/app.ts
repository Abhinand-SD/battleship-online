import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import express from 'express';
import type { AppDeps } from '../deps';
import { createErrorHandler, notFoundHandler } from '../middleware/errorHandler';
import { createRateLimiters } from '../middleware/rateLimit';
import { createRequestLogger } from '../middleware/requestLogger';
import { createSecurityMiddleware } from '../middleware/security';
import { createApiRouter } from './routes';

/** JSON bodies are tiny (credentials, profile updates); anything bigger is rejected with 413. */
export const JSON_BODY_LIMIT = '16kb';

export function createHttpApp(deps: AppDeps): express.Express {
  const { config, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(createRequestLogger(logger));
  app.use(createSecurityMiddleware(config));

  // Plain-text liveness probe for load balancers / container orchestrators.
  app.get('/healthz', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  const limiters = createRateLimiters(config);
  app.use('/api', limiters.api);
  app.use('/api/auth', limiters.auth);
  app.use('/api', express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', createApiRouter(deps));
  app.use('/api', notFoundHandler);

  if (config.SERVE_CLIENT) {
    const dist = resolve(config.CLIENT_DIST);
    const indexFile = join(dist, 'index.html');
    if (!existsSync(indexFile)) {
      logger.warn({ dist }, 'SERVE_CLIENT is enabled but no client build was found; run `npm run build -w @battleship/client`');
    } else {
      logger.info({ dist }, 'Serving the client build');
    }
    app.use(
      express.static(dist, {
        index: ['index.html'],
        setHeaders(res, filePath) {
          // Vite emits hashed file names under /assets: cache those forever, everything else must revalidate.
          res.setHeader(
            'Cache-Control',
            filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    // SPA history fallback for client-side routes (never for the API or the socket endpoint).
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || !existsSync(indexFile)) {
        next();
        return;
      }
      res.sendFile(indexFile, { headers: { 'Cache-Control': 'no-cache' } }, (err) => {
        if (err) next(err);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps));
  return app;
}
