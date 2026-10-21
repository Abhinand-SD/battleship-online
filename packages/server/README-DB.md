# Database setup (server)

The server persists accounts, player statistics, match history and achievements in **PostgreSQL** through
**Prisma 7** (`@prisma/client` + the `pg` driver adapter). Without a database it falls back to an
**in-memory store**.

## Local PostgreSQL

1. Install and start PostgreSQL (any recent version; tested with 18).
2. Create the role and the two databases (dev + test) with the helper script at the repo root:

   ```bash
   npm run db:setup-local          # runs scripts/setup-local-db.sh (needs sudo -u postgres or a superuser psql)
   ```

   It creates the role `battleship` / `battleship` and the databases `battleship` and `battleship_test`.
3. Put the connection strings in `packages/server/.env` (see `.env.example`):

   ```ini
   DATABASE_URL=postgresql://battleship:battleship@localhost:5432/battleship
   TEST_DATABASE_URL=postgresql://battleship:battleship@localhost:5432/battleship_test
   ```

## Migrations

Prisma's configuration lives in `packages/server/prisma.config.ts`; the schema is `prisma/schema.prisma`
and migrations are in `prisma/migrations/`. Prisma 7 no longer reads `.env` on its own, so
`prisma.config.ts` loads `packages/server/.env` itself (variables already set in the shell win).

```bash
npm run db:migrate        # prisma migrate deploy  - applies pending migrations (use this in production/CI)
npm run db:migrate:dev    # prisma migrate dev     - creates a new migration from schema changes (development)
npm run db:generate       # prisma generate        - regenerates the client into src/generated/prisma (also runs on npm install)
npm run db:studio         # prisma studio
```

`prisma migrate dev` needs a *shadow database*. Either grant the role `CREATEDB`
(`ALTER ROLE battleship CREATEDB;`) or point `SHADOW_DATABASE_URL` at a scratch database you do not mind
being reset. The initial migration was produced with
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, which needs no shadow DB.

The generated client (`src/generated/prisma`, git-ignored) must exist before type-checking or running the
server; `npm install` triggers it through the `postinstall` script, or run `npm run db:generate`.

## Running the server

The app does **not** load `.env` by itself. The npm scripts use Node's built-in loader:

```bash
npm run dev     # tsx watch --env-file-if-exists=.env src/index.ts
npm run start   # node --env-file-if-exists=.env dist/index.js
```

A missing `.env` is fine (the flag tolerates it); in that case export the variables yourself or let your
process manager / container runtime inject them.

Achievements are seeded (upserted) from `ACHIEVEMENTS` in `@battleship/shared` every time the server
starts with a database.

## In-memory fallback

When `DATABASE_URL` is **unset** the server logs a warning and uses `createMemoryRepositories()`:

- same behaviour as the Prisma store (guests, accounts, stats, Elo, achievements, leaderboard, match history);
- everything lives in process memory and is **lost on restart**; nothing is shared between instances;
- `GET /api/health` reports `{ store: "memory", db: false }`.

It is meant for local development and tests, not for production (production still only warns).

## Tests

```bash
npx vitest run tests/persistence-memory.test.ts tests/stats-logic.test.ts tests/auth.test.ts tests/http.test.ts

# Prisma repository tests (skipped unless TEST_DATABASE_URL is set). They run `prisma migrate deploy`
# against that database and truncate its tables between tests, so never point it at real data:
TEST_DATABASE_URL=postgresql://battleship:battleship@localhost:5432/battleship_test \
  npx vitest run tests/persistence-prisma.test.ts
```
