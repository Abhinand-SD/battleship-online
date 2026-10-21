import express, { type Router } from 'express';
import { z } from 'zod';
import { toUserProfile } from '../../auth/service';
import type { AppDeps } from '../../deps';
import { AppError } from '../errors';
import { toPlayerStats } from '../mappers';
import { parseOrThrow } from '../validate';

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

export function createUsersRoutes(deps: Pick<AppDeps, 'repos'>): Router {
  const router = express.Router();

  router.get('/users/:id', async (req, res) => {
    const { id } = parseOrThrow(paramsSchema, req.params, 'user id');
    const user = await deps.repos.users.findById(id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const [stats, unlocked] = await Promise.all([deps.repos.stats.getStats(id), deps.repos.achievements.listForUser(id)]);
    res.json({ user: toUserProfile(user), stats: toPlayerStats(stats, unlocked) });
  });

  return router;
}
