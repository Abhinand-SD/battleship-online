# Deployment guide

The game has three deployable parts:

1. **PostgreSQL** – accounts, statistics, match history, leaderboard.
2. **Node.js server** (`packages/server`) – REST API **and** the Socket.IO realtime server. It needs a host
   that supports long-lived WebSocket connections (Render, Railway, Fly.io, a VPS, Kubernetes, …).
   A static-only host (GitHub Pages, Netlify/Vercel static) **cannot** run it.
3. **Web client** (`packages/client`) – a static SPA. Either served by the Node server (`SERVE_CLIENT=true`,
   simplest, same-origin, no CORS) or hosted on a CDN/static host pointing at the API.

## Environment variables

Copy `.env.example` and adjust. The server validates its configuration at startup and refuses to boot in
production without `JWT_SECRET`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables strict checks and compact logs |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | Listen address |
| `DATABASE_URL` | – | PostgreSQL connection string. Unset → in-memory store (dev only; data resets) |
| `JWT_SECRET` | – | ≥16 chars; `openssl rand -hex 32`. **Required in production** |
| `JWT_TTL_DAYS` | `30` | Token lifetime |
| `CORS_ORIGINS` | – | Comma-separated browser origins allowed to call the API/socket when the client is hosted elsewhere |
| `PUBLIC_URL` | – | Public client URL (used for invite links when not same-origin) |
| `SERVE_CLIENT` / `CLIENT_DIST` | `false` / `../client/dist` | Serve the built SPA from the API server |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy / load balancer so rate limiting sees real IPs |
| `LOG_LEVEL` | `info` | pino log level |
| `TURN_TIMEOUT_MS`, `MAX_CONSECUTIVE_TIMEOUTS`, `RECONNECT_GRACE_MS`, `PLACEMENT_TIMEOUT_MS`, `LOBBY_COUNTDOWN_MS`, `BATTLE_COUNTDOWN_MS`, `AI_MOVE_DELAY_MS` | see `.env.example` | Game timings |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `SOCKET_EVENTS_PER_10S`, `ROOM_JOIN_ATTEMPTS_PER_MIN` | see `.env.example` | Abuse protection |
| `VITE_SERVER_URL` (client build) | – | API/socket origin when the client is hosted separately |

## Database setup and migrations

```bash
# one-off: create role + databases on a local PostgreSQL (uses sudo -u postgres)
npm run db:setup-local

# apply migrations (production: run on every deploy before starting the server)
DATABASE_URL=postgresql://user:pass@host:5432/battleship npm run db:migrate

# development: create a new migration after editing packages/server/prisma/schema.prisma
npm run db:migrate:dev
```

`prisma generate` runs automatically on `npm install` (postinstall) and is part of the Docker build.

## Production build

```bash
npm ci
npm run build            # builds the SPA (packages/client/dist) and bundles the server (packages/server/dist)
NODE_ENV=production SERVE_CLIENT=true JWT_SECRET=... DATABASE_URL=... npm start
```

`npm start` runs `node packages/server/dist/index.js`; only runtime dependencies from `node_modules` are
needed (the shared package is bundled in).

## Option A – Docker (single container + PostgreSQL)

```bash
docker compose up --build
# → http://localhost:3001  (client + API + websockets)
```

The image runs `prisma migrate deploy` on start-up and then the server. Set `JWT_SECRET` (and
`PUBLIC_URL`) in the environment or a `.env` file next to `docker-compose.yml`.

## Option B – Platform-as-a-Service (Render / Railway / Fly.io)

1. Provision a managed PostgreSQL instance; copy its connection string to `DATABASE_URL`.
2. Create a **web service** from this repository using the `Dockerfile` (recommended) or with
   build command `npm ci && npm run build` and start command `npm run db:migrate && npm start`.
3. Set `NODE_ENV=production`, `JWT_SECRET`, `SERVE_CLIENT=true`, `TRUST_PROXY=true`, `PUBLIC_URL=https://<your-domain>`.
4. Make sure the platform keeps WebSocket connections open (all three platforms do by default) and that the
   health check points at `/healthz`.
5. Run a single instance, or add Redis for the Socket.IO adapter and the matchmaking queue before scaling
   out (see "Scaling" below).

## Option C – Split hosting (static client + API)

* Build the client with `VITE_SERVER_URL=https://api.example.com npm run build -w @battleship/client` and
  upload `packages/client/dist` to any static host (Netlify, Vercel, S3+CloudFront, …). Configure the host
  to serve `index.html` for unknown paths (SPA fallback) so `/join/ABC123` deep links work.
* Deploy the server as in Option B with `SERVE_CLIENT=false` and
  `CORS_ORIGINS=https://app.example.com`, `PUBLIC_URL=https://app.example.com`.

## HTTPS, cookies and headers

* Terminate TLS at the platform/load balancer and set `TRUST_PROXY=true`. The browser then uses `wss://`
  automatically because the socket connects to the page origin.
* Authentication uses bearer tokens (no cookies), so there is no CSRF surface and no cookie flags to tune.
  If you add cookies, set `Secure`, `HttpOnly` and `SameSite=Lax`.
* `helmet` sets standard security headers; CSP is enabled when the server serves the client.

## Health checks and logs

* `GET /healthz` – liveness (plain `ok`).
* `GET /api/health` – readiness: `{ status, store, db, uptime, runtime: { onlineUsers, activeGames, queueLength } }`;
  returns 503 when the database is unreachable.
* Logs are JSON (pino) in production: request logs, game lifecycle (created/finished), connection events,
  and errors with stack traces. Pipe them to your log platform; set `LOG_LEVEL=debug` for more detail.

## Scaling beyond one instance

The default deployment keeps games, the matchmaking queue and socket rooms in process memory, which is
correct and fast for a single instance. To run several instances behind a load balancer you need:

* Sticky sessions **or** the Socket.IO Redis adapter (`@socket.io/redis-adapter`) so events reach every socket.
* A shared matchmaking queue and game ownership (Redis lists / locks), because today two instances would
  each keep their own queue.

Neither is required for the single-instance setups above.
