import type { MatchSummary } from '@battleship/shared';
import express, { type Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../../deps';
import { getAuthUser, type AuthMiddleware } from '../../middleware/auth';
import { toMatchSummary } from '../mappers';
import { parseOrThrow } from '../validate';

export const MATCHES_MAX_LIMIT = 50;

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(MATCHES_MAX_LIMIT).default(20) });

export function createMatchesRoutes(deps: Pick<AppDeps, 'repos'>, auth: AuthMiddleware): Router {
  const router = express.Router();

  router.get('/matches/me', auth.requireAuth, async (req, res) => {
    const user = getAuthUser(req);
    const { limit } = parseOrThrow(querySchema, req.query, 'query');
    const records = await deps.repos.matches.listForUser(user.id, limit);
    const matches = records.map((m) => toMatchSummary(m, user.id)).filter((m): m is MatchSummary => m !== null);
    res.json({ matches });
  });

  return router;
}
