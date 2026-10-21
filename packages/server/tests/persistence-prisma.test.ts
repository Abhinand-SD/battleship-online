/**
 * Runs the shared repository suite against a real PostgreSQL database.
 * Requires TEST_DATABASE_URL, e.g.
 *   TEST_DATABASE_URL=postgresql://battleship:battleship@localhost:5432/battleship_test npx vitest run tests/persistence-prisma.test.ts
 * Migrations are applied with `prisma migrate deploy` before the suite; data tables are truncated between tests.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENTS } from '@battleship/shared';
import pg from 'pg';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../src/persistence/types';
import { repositorySuite } from './helpers/repositorySuite';

const url = process.env['TEST_DATABASE_URL'];
const describeDb = url ? describe : describe.skip;
if (!url) {
  console.log('[persistence-prisma] TEST_DATABASE_URL is not set; skipping the Prisma repository tests.');
}

describeDb('prisma repositories', () => {
  let repos: Repositories;
  let client: pg.Client;

  beforeAll(async () => {
    const serverRoot = fileURLToPath(new URL('..', import.meta.url));
    const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: url! },
      stdio: 'pipe',
    });
    client = new pg.Client({ connectionString: url! });
    await client.connect();
    const { createPrismaRepositories } = await import('../src/persistence/prisma');
    repos = await createPrismaRepositories(url!, pino({ level: 'silent' }));
  });

  beforeEach(async () => {
    await client.query('TRUNCATE TABLE "UserAchievement", "MatchParticipant", "Match", "PlayerStats", "User" CASCADE');
  });

  afterAll(async () => {
    await repos?.close();
    await client?.end();
  });

  repositorySuite(() => repos);

  it('reports the prisma store, is healthy and has seeded the achievements', async () => {
    expect(repos.kind).toBe('prisma');
    expect(await repos.healthCheck()).toBe(true);
    const rows = await client.query<{ key: string; name: string }>('SELECT key, name FROM "Achievement" ORDER BY key');
    expect(rows.rows.map((r) => r.key)).toEqual([...ACHIEVEMENTS].map((a) => a.key).sort());
    expect(rows.rows.find((r) => r.key === 'admiral')?.name).toBe('Admiral');
  });

  it('persists rows that survive a fresh client', async () => {
    const user = await repos.users.createGuest({ displayName: 'Durable', avatar: 'anchor' });
    const { createPrismaRepositories } = await import('../src/persistence/prisma');
    const second = await createPrismaRepositories(url!, pino({ level: 'silent' }));
    try {
      expect((await second.users.findById(user.id))?.displayName).toBe('Durable');
    } finally {
      await second.close();
    }
  });
});
