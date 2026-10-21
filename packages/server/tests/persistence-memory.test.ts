import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createRepositories } from '../src/persistence';
import { createMemoryRepositories } from '../src/persistence/memory';
import type { Repositories } from '../src/persistence/types';
import { repositorySuite } from './helpers/repositorySuite';

const silent = () => pino({ level: 'silent' });

describe('memory repositories', () => {
  let repos: Repositories;
  beforeEach(() => {
    repos = createMemoryRepositories(silent());
  });

  repositorySuite(() => repos);

  it('is healthy, closes without error and hands out copies', async () => {
    expect(repos.kind).toBe('memory');
    expect(await repos.healthCheck()).toBe(true);
    const user = await repos.users.createGuest({ displayName: 'Copy', avatar: 'anchor' });
    user.displayName = 'Mutated';
    expect((await repos.users.findById(user.id))!.displayName).toBe('Copy');
    await expect(repos.close()).resolves.toBeUndefined();
  });
});

describe('createRepositories', () => {
  it('falls back to the in-memory store with a warning when DATABASE_URL is unset', async () => {
    const logger = silent();
    const warn = vi.spyOn(logger, 'warn');
    const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32) });
    expect(config.DATABASE_URL).toBeUndefined();
    const repos = await createRepositories(config, logger);
    expect(repos.kind).toBe('memory');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1] ?? warn.mock.calls[0]?.[0])).toMatch(/in-memory/);
  });
});
