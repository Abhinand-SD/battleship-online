# Battleship Online

Online multiplayer Battleship for the browser. Two players (or one player and a server-side AI) place a
five-ship fleet on a 10x10 grid and take turns firing until one fleet is sunk. The server is authoritative:
it owns every game, validates every move, keeps hidden fleets to itself and pushes personalised snapshots
to each client over Socket.IO. Accounts, statistics, match history and achievements are stored in
PostgreSQL through Prisma, with an in-memory store for development and tests.

## Features

- **Private rooms** with 6-character codes and shareable invite links (`/join/<code>`).
- **Quick match** through a server-side FIFO queue.
- **Practice mode** against three AI levels: easy (random with occasional follow-up), medium (parity
  hunt/target) and hard (probability-density targeting over all consistent ship placements).
- **Guest play by default**; a guest can register a username/password and is upgraded in place, keeping
  its id, statistics and history. Login/register use HS256 JWTs.
- **Reconnection**: a disconnected player keeps their seat for a grace period and gets the full game state
  back on reconnect (page reload, new tab, network blip).
- **Turn timers** with automatic forfeit after too many consecutive timeouts; placement timeout.
- **Rematch** from the results screen (both players accept; a new game starts in the same room).
- **Stats, leaderboard and achievements**: wins/losses, accuracy, streaks, Elo rating for online modes,
  per-user match history and seven unlockable achievements.
- **Responsive, touch-friendly UI** (React + Tailwind + Motion) with synthesised Web Audio sounds, volume,
  reduced-motion and shot-confirmation settings.

## Tech stack

| Layer | Technology |
| --- | --- |
| Language / tooling | TypeScript 5, npm workspaces, Node.js >= 20.19 |
| Shared package | Pure game engine, AI opponents, zod schemas and socket protocol types |
| Server | Express 5, Socket.IO 4, Prisma 7 (`@prisma/client` + `pg` adapter), jose (JWT), bcryptjs, helmet, cors, express-rate-limit, pino; bundled with esbuild |
| Client | React 19, Vite 7, react-router 7, zustand, Tailwind CSS 4, Motion, lucide-react, socket.io-client |
| Database | PostgreSQL (optional; in-memory fallback) |
| Tests | Vitest (unit), Playwright (end-to-end), GitHub Actions CI |
| Deployment | Dockerfile (multi-stage, single container), docker-compose with PostgreSQL |

## Repository layout

```
.
├── package.json              # npm workspaces root; all day-to-day scripts live here
├── .env.example              # template for packages/server/.env (+ VITE_SERVER_URL note)
├── Dockerfile                # build + runtime image (serves client and API from one process)
├── docker-compose.yml        # app + postgres:16
├── docker-entrypoint.sh      # runs prisma migrate deploy (if DATABASE_URL) then starts the server
├── .github/workflows/ci.yml  # typecheck, unit tests, build, Playwright e2e
├── docs/
│   ├── ARCHITECTURE.md       # state machine, snapshots, matchmaking, AI, persistence, auth
│   ├── PROTOCOL.md           # Socket.IO events, acks, error codes, REST API
│   └── DEPLOYMENT.md         # env vars, Docker, PaaS, split hosting, scaling
├── scripts/
│   └── setup-local-db.sh     # creates the local PostgreSQL role + dev/test databases
└── packages/
    ├── shared/   @battleship/shared  constants, types, engine/, ai/, protocol.ts (zod)
    ├── server/   @battleship/server  src/{auth,game,http,matchmaking,middleware,persistence,realtime}
    │                                 prisma/ (schema + migrations), README-DB.md, tests/
    └── client/   @battleship/client  src/{screens,components,lib}, e2e/ (Playwright specs)
```

## Quick start

### Prerequisites

- **Node.js >= 20.19** and **npm** (the repo is an npm workspace; `package-lock.json` is npm 10).
- **PostgreSQL** is optional. If `DATABASE_URL` is unset (or empty) the server logs a warning and uses an
  in-memory store with identical behaviour; accounts, stats and history are lost on restart, nothing is
  shared between instances, and `GET /api/health` reports `{ store: "memory", db: false }`. The server
  does **not** refuse to start without a database in production; it only warns.
- **Docker** is optional (used for the compose stack or just the database).

### Steps

1. Install dependencies. `postinstall` in the server workspace runs `prisma generate`
   (into `packages/server/src/generated/prisma`, git-ignored), which the server needs to type-check.

   ```bash
   npm install
   ```

2. Create the server env file. The npm scripts load `packages/server/.env` with Node's
   `--env-file-if-exists`, so a missing file is fine; the root `.env.example` is the template.

   ```bash
   cp .env.example packages/server/.env
   ```

   For local development you can leave `JWT_SECRET` unset: the server then signs tokens with a random
   per-process secret (sessions reset on restart). In production it is required (>= 16 characters).

3. (Optional) Set up PostgreSQL and apply migrations. Either use a local server:

   ```bash
   npm run db:setup-local   # creates role battleship/battleship + databases battleship and battleship_test
   npm run db:migrate       # prisma migrate deploy
   ```

   or start only the database from docker-compose:

   ```bash
   docker compose up -d db
   npm run db:migrate
   ```

   The default `DATABASE_URL` in `.env.example` matches both. To skip the database entirely, remove or
   blank `DATABASE_URL` in `packages/server/.env`. See `packages/server/README-DB.md` for shadow databases,
   `db:migrate:dev` and Prisma 7 notes.

4. Run both dev servers (concurrently, with prefixed output):

   ```bash
   npm run dev
   ```

   | What | URL |
   | --- | --- |
   | Client (Vite, hot reload) | http://localhost:5173 |
   | API + Socket.IO server | http://localhost:3001 |
   | Readiness check | http://localhost:3001/api/health |
   | Liveness check | http://localhost:3001/healthz |

   The Vite dev server proxies `/api`, `/healthz` and `/socket.io` to the server, so the client needs no
   `VITE_SERVER_URL` in development. In non-production mode the server automatically allows the origins
   `http://localhost:5173`, `http://127.0.0.1:5173` and `http://localhost:4173` for CORS.

## Environment variables

Server variables are validated at startup by `packages/server/src/config.ts` (zod); an invalid value aborts
the boot. Timing defaults come from `DEFAULT_TIMINGS` in `packages/shared/src/constants.ts`.

### Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`; production enforces `JWT_SECRET` and uses JSON logs |
| `PORT` | `3001` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATABASE_URL` | unset | PostgreSQL connection string; unset/empty selects the in-memory store |
| `JWT_SECRET` | unset | HS256 signing secret, >= 16 chars; required in production, random per process otherwise |
| `JWT_TTL_DAYS` | `30` | Token lifetime in days |
| `CORS_ORIGINS` | empty | Comma-separated browser origins allowed for REST and sockets (plus localhost in dev) |
| `PUBLIC_URL` | unset | Accepted by the config schema; see "Known inconsistencies" (currently unused by the server) |
| `SERVE_CLIENT` | `false` | Serve the built SPA from `CLIENT_DIST` (single-process deployment) |
| `CLIENT_DIST` | `../client/dist` | Path to the built client, relative to `packages/server` |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers behind a proxy so rate limits see real IPs |
| `LOG_LEVEL` | `info` | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `LOG_PRETTY` | unset (pretty unless production) | Force pino-pretty output on/off |
| `LOBBY_COUNTDOWN_MS` | `3000` | Countdown after both lobby players are ready |
| `BATTLE_COUNTDOWN_MS` | `3000` | Countdown between fleet confirmation and the first shot |
| `TURN_TIMEOUT_MS` | `45000` | Time to fire a shot (min 1000); expiry skips the turn |
| `MAX_CONSECUTIVE_TIMEOUTS` | `3` | Skipped turns in a row before forfeiting |
| `RECONNECT_GRACE_MS` | `60000` | Time to reconnect before an active match is lost (min 1000) |
| `PLACEMENT_TIMEOUT_MS` | `180000` | Time to place ships before the game is abandoned (min 10000) |
| `AI_MOVE_DELAY_MS` | `900` | Artificial thinking delay of the practice AI |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window for the HTTP rate limiters |
| `RATE_LIMIT_MAX` | `300` | Requests per window on `/api` |
| `AUTH_RATE_LIMIT_MAX` | `20` | Requests per window on `/api/auth/*` |
| `SOCKET_EVENTS_PER_10S` | `60` | Per-user token bucket for all socket events |
| `ROOM_JOIN_ATTEMPTS_PER_MIN` | `15` | Per-user token bucket for `room:join` |

Used by tooling rather than the running server:

| Variable | Purpose |
| --- | --- |
| `TEST_DATABASE_URL` | Enables the Prisma repository tests (`tests/persistence-prisma.test.ts`); that database is migrated and truncated |
| `SHADOW_DATABASE_URL` | Shadow database for `prisma migrate dev` (alternative to granting `CREATEDB`) |

### Client (Vite, build time)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SERVER_URL` | empty (same origin) | API/socket origin when the client is hosted separately from the server |
| `VITE_DEV_SERVER_PROXY` | `http://localhost:3001` | Target of the Vite dev proxy (used by the Playwright config) |

## Scripts

All root scripts delegate to workspaces (`-w @battleship/<name>`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the server (`tsx watch`) and client (`vite`) together |
| `npm run build` | Builds the client (`vite build`) then bundles the server with esbuild into `packages/server/dist/index.js` |
| `npm start` | Runs the bundled server (`node --env-file-if-exists=.env dist/index.js`) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm test` | `vitest run` in every workspace that has a `test` script |
| `npm run test:e2e` | Playwright end-to-end tests (see Testing) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate deploy` (production/CI) |
| `npm run db:migrate:dev` | `prisma migrate dev` (creates a migration from schema changes) |
| `npm run db:setup-local` | Runs `scripts/setup-local-db.sh` (needs `sudo -u postgres` or a superuser `psql`) |

Workspace-only extras: `npm run db:studio -w @battleship/server`, `npm run preview -w @battleship/client`
(serves the production build on port 4173), and `npm run test:watch -w @battleship/<shared|server|client>`.

## How to play

- **Board**: 10x10, columns A-J, rows 1-10.
- **Fleet**: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2); 17 cells in total.
  Ships are placed horizontally or vertically without overlapping; the client previews validity with the
  same engine the server uses to validate the confirmed fleet.
- **Modes**: *Private room* (create, share the code or link, both players ready up in a lobby),
  *Quick match* (join the queue; the first two distinct players are paired), *Practice* (easy, medium or
  hard AI). Quick match and practice skip the lobby and start in placement.
- **Flow**: `WAITING` (private only) -> `PLACING_SHIPS` -> `READY` (3 s countdown, the server picks who
  fires first with a fair coin) -> `IN_BATTLE` -> `FINISHED`.
- **Turns**: one shot per turn; the turn always passes to the opponent after a shot, hit or miss. Sinking
  a ship reveals its cells to the attacker. The first player to hit all 17 enemy cells wins.
- **Turn timer**: 45 s per shot by default; an expired timer skips the turn, and 3 consecutive skipped
  turns forfeit the match (`TIMEOUT`). Forfeiting manually is possible during battle.
- **Disconnects**: a player has 60 s by default to reconnect. If the grace period expires during a battle
  the match is lost (`ABANDONED`); before the battle a private room returns to the lobby and a quick match
  is cancelled without recording statistics. Placement must be finished within 3 minutes.
- **Rematch**: on the results screen both players can accept a rematch, which creates a new game in the
  same room. Practice games count towards `practiceGames`/`practiceWins` only and do not affect rating.
- **Achievements**: First Victory, Sharpshooter (win with >= 60% accuracy), Flawless (win without losing a
  ship), Comeback (win after losing four ships), Hot Streak (three online wins in a row), Veteran
  (25 matches), Admiral (beat the hard AI).

## Testing

### Unit tests (Vitest)

```bash
npm test                               # every workspace
npm run test -w @battleship/shared     # engine, placement, AI, protocol, stats (tests/)
npm run test -w @battleship/server     # auth, HTTP, game session, session manager, persistence (tests/)
```

- Server tests run with `NODE_ENV=test`, `LOG_LEVEL=silent` and no file parallelism; most use the
  in-memory store. `tests/persistence-prisma.test.ts` is skipped unless `TEST_DATABASE_URL` is set; it runs
  `prisma migrate deploy` against that database and truncates its tables, so never point it at real data.
- The client workspace is configured for jsdom + Testing Library (`src/**/*.test.{ts,tsx}`) but currently
  contains no test files, so its `vitest run` exits with code 1 ("No test files found") and `npm test` at the
  root fails at that step until a test is added or `passWithNoTests` is enabled.

### End-to-end tests (Playwright)

```bash
npm run test:e2e
```

`packages/client/playwright.config.ts` starts everything itself (`reuseExistingServer: false`, so ports
3101 and 5174 must be free):

- the server via `npx tsx src/index.ts` on port 3101 with the in-memory store (`DATABASE_URL=''`), a fixed
  `JWT_SECRET`, fast countdowns (500 ms), `AI_MOVE_DELAY_MS=150` and `RECONNECT_GRACE_MS=15000`;
- the Vite dev server on port 5174 with `VITE_DEV_SERVER_PROXY` pointing at that server.

Specs run serially in one worker: `online-match.spec.ts` (two browser contexts play a full private-room
match and rematch, quick match pairing, reload mid-battle reconnection, unknown invite code),
`practice.spec.ts` (AI fires back, forfeit) and `responsive.spec.ts` (no horizontal overflow on mobile).
The default project uses the locally installed Google Chrome (`channel: 'chrome'`). To use Playwright's
bundled browser instead, as CI does:

```bash
cd packages/client
npx playwright install --with-deps chromium
PW_CHANNEL=chromium npx playwright test
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, `typecheck`, `test` (against a `postgres:16` service with
`TEST_DATABASE_URL` set), `build` and the Playwright suite, uploading the HTML report on failure.

## Docker and production

```bash
docker compose up --build        # app + PostgreSQL -> http://localhost:3001 (client, API and websockets)
```

The image is a multi-stage build: `npm ci`, `prisma generate`, `npm run build`, then a slim runtime that
sets `NODE_ENV=production`, `SERVE_CLIENT=true`, `TRUST_PROXY=true` and a `/healthz` health check. The
entrypoint runs `prisma migrate deploy` when `DATABASE_URL` is set and then starts `dist/index.js`.
Override `JWT_SECRET`, `CORS_ORIGINS` and `PUBLIC_URL` through the shell or a `.env` file next to
`docker-compose.yml`; the compose default secret is a placeholder.

Without Docker:

```bash
npm ci && npm run build
DATABASE_URL=... npm run db:migrate
NODE_ENV=production SERVE_CLIENT=true JWT_SECRET=... DATABASE_URL=... npm start
```

The server needs a host that keeps WebSocket connections open; a static-only host cannot run it. For
split hosting (static client + API) build the client with `VITE_SERVER_URL=https://api.example.com` and
set `CORS_ORIGINS` on the server. Platform notes, SPA fallback for `/join/<code>` deep links and scaling
beyond one instance (Redis adapter + shared queue) are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Architecture

- `@battleship/shared` holds the rules (`engine/placement.ts`, `engine/board.ts`, `engine/stats.ts`), the
  AI (`ai/`), and the socket/REST contracts with zod schemas (`protocol.ts`). Both sides import it as
  TypeScript source; esbuild inlines it into the server bundle.
- The server keeps every game as a `GameSession` managed by a `SessionManager`, with an in-process
  `Matchmaker` queue and Socket.IO handlers under `src/realtime/`. REST routes (`src/http/routes/`) cover
  auth, profile, stats, leaderboard, match history and health. Repository interfaces in
  `src/persistence/` have Prisma and in-memory implementations; match recording is transactional.
- The client is snapshot-driven: a single zustand store (`lib/store.ts`), a typed socket with request
  helpers and infinite reconnection (`lib/socket.ts`), and screens chosen from `snapshot.phase`
  (`GameScreen` -> Lobby / Placement / Battle / Results). Routes: `/`, `/play`, `/game`, `/join/:code`,
  `/stats`, `/leaderboard`, `/settings`, `/account`.
- On connect or reconnect the server pushes `session:state`; every state change sends a personalised
  `game:state` snapshot plus a `game:event` for animations and sounds.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (state machine, timers, snapshot personalisation,
persistence, auth) and [docs/PROTOCOL.md](docs/PROTOCOL.md) (events, acks, error codes, REST API).

## Security notes

- **Server-authoritative state**: phases, turns, timers and results are decided on the server; the client
  only sends requests that are acknowledged with `{ ok }` or an error code.
- **No fleet leaks**: snapshots are built per viewer; unsunk enemy ship positions never appear in
  snapshots, events, acks or REST responses, and the AI only sees the same `EnemyBoardView` a human gets.
  Tests assert this.
- **Validation**: every socket payload and REST body is parsed with the shared zod schemas
  (`INVALID_PAYLOAD` on failure); fleets are additionally checked by the engine; attacks must carry the
  current `moveNumber` (`STALE_MOVE` otherwise), so retries and replays cannot fire twice.
- **Rate limiting**: `express-rate-limit` on `/api` and a stricter limiter on `/api/auth/*`; per-user
  token buckets for socket events and for `room:join`. Room codes are 6 characters from a 32-symbol
  alphabet generated with `crypto.randomBytes`.
- **Headers and CORS**: `helmet` on every response, with a Content-Security-Policy when the server serves
  the client; CORS only for origins in `CORS_ORIGINS` (plus localhost in dev), `credentials: false`.
- **Auth**: HS256 JWTs signed with `jose`, sent as a bearer header and as `auth.token` on the socket
  handshake; no cookies, so no CSRF surface. Passwords are hashed with `bcryptjs` (cost 10) and login
  runs a dummy comparison for unknown usernames to avoid timing-based enumeration. `JWT_SECRET` must be
  set in production; set `TRUST_PROXY=true` behind a proxy so limits apply to real client IPs.

## Known inconsistencies

Observed while writing this README; none are fixed here.

- `PUBLIC_URL` is documented in `.env.example`, `docs/DEPLOYMENT.md` and `docker-compose.yml` as the base
  for invite links, but no server code reads it; the client builds invite links from
  `window.location.origin` (`packages/client/src/lib/utils.ts`).
- `LOG_PRETTY` exists in `config.ts` but is missing from `.env.example` and `docs/DEPLOYMENT.md`.
- The client workspace has a `test` script but no test files, so `npm test` currently fails there.
- `packages/server/README-DB.md` says PostgreSQL was "tested with 18" while compose and CI use `postgres:16`.

## License

This repository does not contain a `LICENSE` file. Until one is added the code is not licensed for reuse
(all rights reserved by default); add a license such as MIT before publishing.
