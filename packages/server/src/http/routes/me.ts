import { profileUpdateSchema } from '@battleship/shared';
import express, { type Router } from 'express';
import { toUserProfile } from '../../auth/service';
import type { AppDeps } from '../../deps';
import { getAuthUser, type AuthMiddleware } from '../../middleware/auth';
import { parseOrThrow } from '../validate';

export function createMeRoutes(deps: Pick<AppDeps, 'repos'>, auth: AuthMiddleware): Router {
  const router = express.Router();

  router.get('/me', auth.requireAuth, (req, res) => {
    res.json({ user: toUserProfile(getAuthUser(req)) });
  });

  router.patch('/me', auth.requireAuth, async (req, res) => {
    const user = getAuthUser(req);
    const payload = parseOrThrow(profileUpdateSchema, req.body);
    const updated = await deps.repos.users.updateProfile(user.id, payload);
    res.json({ user: toUserProfile(updated) });
  });

  return router;
}
