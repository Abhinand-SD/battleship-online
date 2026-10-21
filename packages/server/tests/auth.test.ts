import { SignJWT } from 'jose';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_IDS, displayNameSchema } from '@battleship/shared';
import { randomAvatar, randomCallSign } from '../src/auth/names';
import { BCRYPT_COST, hashPassword, verifyPassword } from '../src/auth/passwords';
import { createAuthService, toUserProfile, type AuthService } from '../src/auth/service';
import { TOKEN_ISSUER, createTokenService } from '../src/auth/tokens';
import { loadConfig } from '../src/config';
import { AppError } from '../src/http/errors';
import { createMemoryRepositories } from '../src/persistence/memory';
import type { Repositories } from '../src/persistence/types';

const SECRET = 'x'.repeat(32);
const logger = pino({ level: 'silent' });
const config = (env: Record<string, string> = {}) => loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET, ...env });

describe('token service', () => {
  it('signs tokens that verify back to the user id', async () => {
    const tokens = createTokenService(config(), logger);
    const token = await tokens.sign('user_1');
    expect(token.split('.')).toHaveLength(3);
    expect(await tokens.verify(token)).toEqual({ userId: 'user_1' });
  });

  it('encodes the configured TTL in days', async () => {
    const tokens = createTokenService(config({ JWT_TTL_DAYS: '2' }), logger);
    const token = await tokens.sign('user_1');
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number; sub: string; iss: string };
    expect(payload.exp - payload.iat).toBe(2 * 86_400);
    expect(payload.sub).toBe('user_1');
    expect(payload.iss).toBe(TOKEN_ISSUER);
  });

  it('rejects expired tokens', async () => {
    const tokens = createTokenService(config(), logger);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(TOKEN_ISSUER)
      .setSubject('user_1')
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(new TextEncoder().encode(SECRET));
    expect(await tokens.verify(expired)).toBeNull();
  });

  it('rejects tampered tokens, wrong secrets, wrong issuers and garbage', async () => {
    const tokens = createTokenService(config(), logger);
    const token = await tokens.sign('user_1');
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: 'user_2' })).toString('base64url');
    expect(await tokens.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    const flipped = signature.endsWith('a') ? `${signature.slice(0, -1)}b` : `${signature.slice(0, -1)}a`;
    expect(await tokens.verify(`${header}.${payload}.${flipped}`)).toBeNull();

    const other = createTokenService(config({ JWT_SECRET: 'y'.repeat(32) }), logger);
    expect(await other.verify(token)).toBeNull();

    const wrongIssuer = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer('someone-else').setSubject('user_1').setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
    expect(await tokens.verify(wrongIssuer)).toBeNull();
    const noSubject = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(TOKEN_ISSUER).setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
    expect(await tokens.verify(noSubject)).toBeNull();
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${payload}.`;
    expect(await tokens.verify(unsigned)).toBeNull();
    expect(await tokens.verify('')).toBeNull();
    expect(await tokens.verify('not-a-token')).toBeNull();
  });

  it('falls back to a per-process random secret outside production and warns', async () => {
    const warnLogger = pino({ level: 'silent' });
    const warn = vi.spyOn(warnLogger, 'warn');
    const cfg = loadConfig({ NODE_ENV: 'test' });
    const a = createTokenService(cfg, warnLogger);
    const b = createTokenService(cfg, warnLogger);
    expect(warn).toHaveBeenCalledTimes(2);
    const token = await a.sign('user_1');
    expect(await b.verify(token)).toEqual({ userId: 'user_1' });
    const withSecret = createTokenService(config(), warnLogger);
    expect(await withSecret.verify(token)).toBeNull();
  });

  it('refuses to start without a secret in production', () => {
    expect(() => createTokenService({ JWT_SECRET: undefined, JWT_TTL_DAYS: 30, isProduction: true }, logger)).toThrow(/JWT_SECRET/);
  });
});

describe('passwords', () => {
  it('hashes with bcrypt cost 10 and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});

describe('guest names', () => {
  it('produces valid display names and known avatars', () => {
    for (let i = 0; i < 200; i++) {
      const name = randomCallSign();
      expect(displayNameSchema.safeParse(name).success, name).toBe(true);
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(AVATAR_IDS).toContain(randomAvatar());
    }
    expect(randomCallSign(() => 0)).toBe('Captain Nova');
    expect(randomCallSign(() => 0.999999)).toBe('Lookout Atlas');
    expect(randomAvatar(() => 0)).toBe('anchor');
  });
});

describe('auth service', () => {
  let repos: Repositories;
  let service: AuthService;
  const tokens = createTokenService(config(), logger);

  beforeEach(() => {
    repos = createMemoryRepositories(logger);
    service = createAuthService({ repos, tokens, logger });
  });

  it('creates guests with a token and a profile', async () => {
    const res = await service.createGuest();
    expect(await tokens.verify(res.token)).toEqual({ userId: res.user.id });
    expect(res.user).toMatchObject({ isGuest: true, username: null });
    expect(displayNameSchema.safeParse(res.user.displayName).success).toBe(true);
    expect(AVATAR_IDS).toContain(res.user.avatar);
    expect(new Date(res.user.createdAt).getTime()).not.toBeNaN();
    const named = await service.createGuest({ displayName: 'Salty Dog' });
    expect(named.user.displayName).toBe('Salty Dog');
    expect(Object.keys(named.user).sort()).toEqual(['avatar', 'createdAt', 'displayName', 'id', 'isGuest', 'username']);
  });

  it('registers accounts, logs in and rejects bad credentials', async () => {
    const reg = await service.register({ username: 'Captain_Ahab', password: 'whitewhale1' });
    expect(reg.user).toMatchObject({ isGuest: false, username: 'captain_ahab' });
    const login = await service.login({ username: 'captain_ahab', password: 'whitewhale1' });
    expect(login.user.id).toBe(reg.user.id);

    await expect(service.login({ username: 'captain_ahab', password: 'nope-nope' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    await expect(service.login({ username: 'nobody', password: 'whitewhale1' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    await expect(service.register({ username: 'captain_ahab', password: 'different1' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN', status: 409 });
  });

  it('upgrades a guest in place and refuses to re-register an account', async () => {
    const guest = await service.createGuest({ displayName: 'Ishmael' });
    const guestRecord = await repos.users.findById(guest.user.id);
    const upgraded = await service.register({ username: 'ishmael', password: 'callme123' }, { currentUser: guestRecord });
    expect(upgraded.user.id).toBe(guest.user.id);
    expect(upgraded.user).toMatchObject({ isGuest: false, username: 'ishmael', displayName: 'Ishmael' });

    const registered = await repos.users.findById(guest.user.id);
    const err = await service.register({ username: 'another', password: 'callme123' }, { currentUser: registered }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'INVALID_PAYLOAD', status: 400, message: 'Already registered' });
    expect(await repos.users.findByUsername('another')).toBeNull();
  });

  it('maps records to public profiles without secrets', async () => {
    const user = await repos.users.createAccount({ username: 'u', passwordHash: 'secret', displayName: 'U', avatar: 'anchor' });
    const profile = toUserProfile(user);
    expect(profile).toEqual({ id: user.id, displayName: 'U', avatar: 'anchor', isGuest: false, username: 'u', createdAt: user.createdAt.toISOString() });
    expect(JSON.stringify(profile)).not.toContain('secret');
  });
});
