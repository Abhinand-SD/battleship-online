/**
 * Prisma CLI configuration (Prisma 7). The datasource URL is NOT part of schema.prisma any more;
 * it is read from the DATABASE_URL environment variable here.
 *
 * Prisma 7 no longer loads `.env` files by itself, so this file applies a minimal loader for the
 * `.env` next to it (values already present in the environment always win). That keeps
 * `npm run db:migrate` / `db:migrate:dev` / `db:studio` working out of the box in development.
 *
 * `prisma generate` does not need a database, so the datasource block is only provided when a URL
 * is available; migration commands fail with Prisma's own "datasource URL missing" error otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(resolve(dirname(fileURLToPath(import.meta.url)), '.env'));

const url = process.env['DATABASE_URL'];
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
