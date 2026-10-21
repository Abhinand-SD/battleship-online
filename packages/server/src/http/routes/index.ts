import express, { type Router } from 'express';
import { createAuthService } from '../../auth/service';
import type { AppDeps } from '../../deps';
import { createAuthMiddleware } from '../../middleware/auth';
import { createAuthRoutes } from './auth';
import { createHealthRoutes } from './health';
import { createLeaderboardRoutes } from './leaderboard';
import { createMatchesRoutes } from './matches';
import { createMeRoutes } from './me';
import { createStatsRoutes } from './stats';
import { createUsersRoutes } from './users';

/** Everything mounted under /api. */
export function createApiRouter(deps: AppDeps): Router {
  const router = express.Router();
  const auth = createAuthMiddleware(deps);
  const authService = createAuthService(deps);

  router.use(createAuthRoutes(authService, auth));
  router.use(createMeRoutes(deps, auth));
  router.use(createStatsRoutes(deps, auth));
  router.use(createUsersRoutes(deps));
  router.use(createLeaderboardRoutes(deps));
  router.use(createMatchesRoutes(deps, auth));
  router.use(createHealthRoutes(deps));
  return router;
}
