import express, { type Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../../deps';
import { toLeaderboardEntry } from '../mappers';
import { parseOrThrow } from '../validate';

export const LEADERBOARD_MAX_LIMIT = 100;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LEADERBOARD_MAX_LIMIT).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export function createLeaderboardRoutes(deps: Pick<AppDeps, 'repos'>): Router {
  const router = express.Router();

  router.get('/leaderboard', async (req, res) => {
    const { limit, offset } = parseOrThrow(querySchema, req.query, 'query');
    const rows = await deps.repos.stats.leaderboard(limit, offset);
    res.json({ entries: rows.map((row, index) => toLeaderboardEntry(offset + index + 1, row.user, row.stats)) });
  });

  return router;
}
