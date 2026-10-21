import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@battleship/shared';
import { createTokenService } from '../src/auth/tokens';
import { loadConfig } from '../src/config';
import type { AppDeps } from '../src/deps';
import { createHttpApp } from '../src/http/app';
import { createLogger } from '../src/logger';
import { createMemoryRepositories } from '../src/persistence/memory';
import { quickWin } from './helpers/repositorySuite';

const SECRET = 'x'.repeat(32);

function buildApp(env: Record<string, string> = {}) {
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET, AUTH_RATE_LIMIT_MAX: '100', RATE_LIMIT_MAX: '1000', ...env });
  const logger = createLogger(config);
  const repos = createMemoryRepositories(logger);
  const tokens = createTokenService(config, logger);
  const deps: AppDeps = {
    config,
    logger,
    repos,
    tokens,
    runtime: { stats: () => ({ connectedSockets: 3, onlineUsers: 2, activeGames: 1, queueLength: 0 }) },
  };
  return { app: createHttpApp(deps), deps };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('HTTP API', () => {
  describe('auth', () => {
    it('creates guests and authenticates them', async () => {
      const { app } = buildApp();
      const res = await request(app).post('/api/auth/guest').send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toMatchObject({ isGuest: true, username: null });
      expect(res.body.user.displayName.length).toBeGreaterThan(2);

      const me = await request(app).get('/api/me').set(bearer(res.body.token));
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(res.body.user.id);

      const named = await request(app).post('/api/auth/guest').send({ displayName: 'Salty Dog' });
      expect(named.body.user.displayName).toBe('Salty Dog');
      const noBody = await request(app).post('/api/auth/guest');
      expect(noBody.status).toBe(200);

      const bad = await request(app).post('/api/auth/guest').send({ displayName: 'x' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('INVALID_PAYLOAD');
      expect(bad.body.error.details.issues[0].path).toBe('displayName');
    });

    it('registers, logs in, rejects wrong passwords and duplicate usernames', async () => {
      const { app } = buildApp();
      const reg = await request(app).post('/api/auth/register').send({ username: 'Captain_One', password: 'password123', displayName: 'Captain One' });
      expect(reg.status).toBe(200);
      expect(reg.body.user).toMatchObject({ username: 'captain_one', isGuest: false, displayName: 'Captain One' });
      expect(reg.body.user.passwordHash).toBeUndefined();

      const login = await request(app).post('/api/auth/login').send({ username: 'captain_one', password: 'password123' });
      expect(login.status).toBe(200);
      expect(login.body.user.id).toBe(reg.body.user.id);
      expect(typeof login.body.token).toBe('string');

      const wrong = await request(app).post('/api/auth/login').send({ username: 'captain_one', password: 'password124' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'password123' });
      expect(unknown.status).toBe(401);

      const dup = await request(app).post('/api/auth/register').send({ username: 'captain_one', password: 'password999' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('USERNAME_TAKEN');

      const weak = await request(app).post('/api/auth/register').send({ username: 'ok_name', password: 'short' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.code).toBe('INVALID_PAYLOAD');
      const badName = await request(app).post('/api/auth/register').send({ username: 'no spaces!', password: 'password123' });
      expect(badName.status).toBe(400);
    });

    it('upgrades a guest in place when its token is presented', async () => {
      const { app } = buildApp();
      const guest = await request(app).post('/api/auth/guest').send({ displayName: 'Guest Gal' });
      const reg = await request(app).post('/api/auth/register').set(bearer(guest.body.token)).send({ username: 'upgraded', password: 'password123' });
      expect(reg.status).toBe(200);
      expect(reg.body.user.id).toBe(guest.body.user.id);
      expect(reg.body.user).toMatchObject({ isGuest: false, username: 'upgraded', displayName: 'Guest Gal' });

      const again = await request(app).post('/api/auth/register').set(bearer(reg.body.token)).send({ username: 'another', password: 'password123' });
      expect(again.status).toBe(400);
      expect(again.body.error).toMatchObject({ code: 'INVALID_PAYLOAD', message: 'Already registered' });

      // A stale / invalid token is ignored and a brand-new account is created instead.
      const fresh = await request(app).post('/api/auth/register').set(bearer('garbage')).send({ username: 'fresh_one', password: 'password123' });
      expect(fresh.status).toBe(200);
      expect(fresh.body.user.id).not.toBe(guest.body.user.id);
    });

    it('rate limits /api/auth/* with the RATE_LIMITED error body', async () => {
      const { app } = buildApp({ AUTH_RATE_LIMIT_MAX: '5' });
      for (let i = 0; i < 5; i++) {
        const ok = await request(app).post('/api/auth/guest').send({});
        expect(ok.status).toBe(200);
      }
      const limited = await request(app).post('/api/auth/login').send({ username: 'x_y_z', password: 'password123' });
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(limited.headers['ratelimit']).toBeDefined();
      const unaffected = await request(app).get('/api/leaderboard');
      expect(unaffected.status).toBe(200);
    });
  });

  describe('profile and stats', () => {
    it('requires a valid bearer token', async () => {
      const { app } = buildApp();
      const none = await request(app).get('/api/me');
      expect(none.status).toBe(401);
      expect(none.body.error.code).toBe('UNAUTHORIZED');
      const bad = await request(app).get('/api/me').set(bearer('not.a.token'));
      expect(bad.status).toBe(401);
      const basic = await request(app).get('/api/stats/me').set({ Authorization: 'Basic abc' });
      expect(basic.status).toBe(401);

      const { app: other } = buildApp({ JWT_SECRET: 'y'.repeat(32) });
      const foreign = await request(other).post('/api/auth/guest').send({});
      const rejected = await request(app).get('/api/me').set(bearer(foreign.body.token));
      expect(rejected.status).toBe(401);
    });

    it('updates the profile and validates avatars', async () => {
      const { app } = buildApp();
      const guest = await request(app).post('/api/auth/guest').send({});
      const ok = await request(app).patch('/api/me').set(bearer(guest.body.token)).send({ avatar: 'kraken', displayName: 'Deep One' });
      expect(ok.status).toBe(200);
      expect(ok.body.user).toMatchObject({ avatar: 'kraken', displayName: 'Deep One' });

      const bad = await request(app).patch('/api/me').set(bearer(guest.body.token)).send({ avatar: 'nope' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('INVALID_PAYLOAD');
      expect(bad.body.error.details.issues[0].path).toBe('avatar');
      const me = await request(app).get('/api/me').set(bearer(guest.body.token));
      expect(me.body.user.avatar).toBe('kraken');
    });

    it('serves stats, public profiles and 404s for unknown users', async () => {
      const { app } = buildApp();
      const guest = await request(app).post('/api/auth/guest').send({});
      const stats = await request(app).get('/api/stats/me').set(bearer(guest.body.token));
      expect(stats.status).toBe(200);
      expect(stats.body.rank).toBeNull();
      expect(stats.body.stats).toMatchObject({ userId: guest.body.user.id, rating: 1000, gamesPlayed: 0, winRate: 0, accuracy: 0 });
      expect(stats.body.stats.achievements).toHaveLength(ACHIEVEMENTS.length);
      expect(stats.body.stats.achievements.every((a: { unlockedAt: string | null }) => a.unlockedAt === null)).toBe(true);

      const pub = await request(app).get(`/api/users/${guest.body.user.id}`);
      expect(pub.status).toBe(200);
      expect(pub.body.user).toEqual(guest.body.user);
      expect(pub.body.stats.rating).toBe(1000);
      const missing = await request(app).get('/api/users/does-not-exist');
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('leaderboard and matches', () => {
    it('is empty, then reflects recorded matches with ranks and summaries', async () => {
      const { app, deps } = buildApp();
      const empty = await request(app).get('/api/leaderboard');
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual({ entries: [] });

      const a = await request(app).post('/api/auth/guest').send({ displayName: 'Alice' });
      const b = await request(app).post('/api/auth/guest').send({ displayName: 'Bob' });
      const alice = (await deps.repos.users.findById(a.body.user.id))!;
      const bob = (await deps.repos.users.findById(b.body.user.id))!;
      await deps.repos.matches.recordMatch(quickWin(alice, bob));

      const board = await request(app).get('/api/leaderboard?limit=10');
      expect(board.body.entries).toHaveLength(2);
      expect(board.body.entries[0]).toMatchObject({ rank: 1, userId: alice.id, displayName: 'Alice', rating: 1016, wins: 1, losses: 0, gamesPlayed: 1, winRate: 100, isGuest: true });
      expect(board.body.entries[1]).toMatchObject({ rank: 2, userId: bob.id, rating: 984, losses: 1, winRate: 0 });
      expect(board.body.entries[0].accuracy).toBeCloseTo(42.5, 1);

      const page = await request(app).get('/api/leaderboard?limit=1&offset=1');
      expect(page.body.entries).toEqual([expect.objectContaining({ rank: 2, userId: bob.id })]);
      const tooMany = await request(app).get('/api/leaderboard?limit=1000');
      expect(tooMany.status).toBe(400);
      const nonsense = await request(app).get('/api/leaderboard?offset=-1');
      expect(nonsense.status).toBe(400);

      const stats = await request(app).get('/api/stats/me').set(bearer(a.body.token));
      expect(stats.body.rank).toBe(1);
      expect(stats.body.stats.achievements.find((x: { key: string }) => x.key === 'first_victory').unlockedAt).not.toBeNull();

      const matches = await request(app).get('/api/matches/me').set(bearer(a.body.token));
      expect(matches.status).toBe(200);
      expect(matches.body.matches).toHaveLength(1);
      expect(matches.body.matches[0]).toMatchObject({
        mode: 'QUICK',
        endReason: 'ALL_SUNK',
        won: true,
        opponent: { displayName: 'Bob', isAi: false },
        shots: 40,
        hits: 17,
        accuracy: 42.5,
        shipsLost: 2,
        ratingChange: 16,
      });
      expect(matches.body.matches[0].opponent.aiDifficulty).toBeUndefined();
      expect(new Date(matches.body.matches[0].endedAt).getTime()).not.toBeNaN();
      const bobs = await request(app).get('/api/matches/me?limit=1').set(bearer(b.body.token));
      expect(bobs.body.matches[0]).toMatchObject({ won: false, ratingChange: -16, opponent: { displayName: 'Alice' } });
      const badLimit = await request(app).get('/api/matches/me?limit=0').set(bearer(b.body.token));
      expect(badLimit.status).toBe(400);
      const anon = await request(app).get('/api/matches/me');
      expect(anon.status).toBe(401);
    });
  });

  describe('health, errors and headers', () => {
    it('reports health for the memory store and runtime stats', async () => {
      const { app } = buildApp();
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({ status: 'ok', store: 'memory', db: false, runtime: { connectedSockets: 3, onlineUsers: 2, activeGames: 1, queueLength: 0 } });
      expect(typeof health.body.uptime).toBe('number');

      const healthz = await request(app).get('/healthz');
      expect(healthz.status).toBe(200);
      expect(healthz.text).toBe('ok');

      const online = await request(app).get('/api/stats/online');
      expect(online.body).toEqual({ connectedSockets: 3, onlineUsers: 2, activeGames: 1, queueLength: 0 });
    });

    it('returns 503 when the database behind a prisma store is down', async () => {
      const { app, deps } = buildApp();
      deps.repos.kind = 'prisma';
      deps.repos.healthCheck = async () => false;
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(503);
      expect(health.body).toMatchObject({ status: 'degraded', store: 'prisma', db: false });
    });

    it('uses the shared error shape for 404s and malformed bodies', async () => {
      const { app } = buildApp();
      const api404 = await request(app).get('/api/nope');
      expect(api404.status).toBe(404);
      expect(api404.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /nope not found' } });
      const root404 = await request(app).get('/nothing-here');
      expect(root404.status).toBe(404);
      expect(root404.body.error.code).toBe('NOT_FOUND');
      const wrongMethod = await request(app).delete('/api/me');
      expect(wrongMethod.status).toBe(404);

      const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error).toEqual({ code: 'INVALID_PAYLOAD', message: 'Malformed JSON body' });

      const huge = await request(app).post('/api/auth/login').send({ username: 'a', password: 'b'.repeat(20_000) });
      expect(huge.status).toBe(413);
      expect(huge.body.error.code).toBe('INVALID_PAYLOAD');
    });

    it('sets security headers and applies the CORS allowlist', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const preflight = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-allow-headers']).toMatch(/Authorization/);
      const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
