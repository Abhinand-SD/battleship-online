import express, { type Router } from 'express';
import type { AppDeps } from '../../deps';

export function createHealthRoutes(deps: Pick<AppDeps, 'repos' | 'runtime'>): Router {
  const router = express.Router();

  /** 503 when the configured database is unreachable; the in-memory store is always "ok" with db=false. */
  router.get('/health', async (_req, res) => {
    const storeHealthy = await deps.repos.healthCheck();
    const db = deps.repos.kind === 'prisma' && storeHealthy;
    const ok = deps.repos.kind === 'memory' ? true : db;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      store: deps.repos.kind,
      db,
      uptime: Math.round(process.uptime()),
      runtime: deps.runtime.stats(),
    });
  });

  return router;
}
