import express, { type Router } from 'express';
import type { AppDeps } from '../../deps';
import { getAuthUser, type AuthMiddleware } from '../../middleware/auth';
import { toPlayerStats } from '../mappers';

export function createStatsRoutes(deps: Pick<AppDeps, 'repos' | 'runtime'>, auth: AuthMiddleware): Router {
  const router = express.Router();

  router.get('/stats/me', auth.requireAuth, async (req, res) => {
    const user = getAuthUser(req);
    const [stats, unlocked, rank] = await Promise.all([
      deps.repos.stats.getStats(user.id),
      deps.repos.achievements.listForUser(user.id),
      deps.repos.stats.rankOf(user.id),
    ]);
    res.json({ stats: toPlayerStats(stats, unlocked), rank });
  });

  /** Live counters from the realtime layer (sockets, online users, active games, queue length). */
  router.get('/stats/online', (_req, res) => {
    res.json(deps.runtime.stats());
  });

  return router;
}
