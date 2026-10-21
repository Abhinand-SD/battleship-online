import { guestPayloadSchema, loginPayloadSchema, registerPayloadSchema } from '@battleship/shared';
import express, { type Router } from 'express';
import type { AuthService } from '../../auth/service';
import { getOptionalAuthUser, type AuthMiddleware } from '../../middleware/auth';
import { parseOrThrow } from '../validate';

export function createAuthRoutes(service: AuthService, auth: AuthMiddleware): Router {
  const router = express.Router();

  router.post('/auth/guest', async (req, res) => {
    const payload = parseOrThrow(guestPayloadSchema, req.body ?? undefined);
    res.json(await service.createGuest(payload ?? {}));
  });

  // A valid guest bearer token upgrades that guest in place (same id, stats and history).
  router.post('/auth/register', auth.optionalAuth, async (req, res) => {
    const payload = parseOrThrow(registerPayloadSchema, req.body);
    res.json(await service.register(payload, { currentUser: getOptionalAuthUser(req) }));
  });

  router.post('/auth/login', async (req, res) => {
    const payload = parseOrThrow(loginPayloadSchema, req.body);
    res.json(await service.login(payload));
  });

  return router;
}
