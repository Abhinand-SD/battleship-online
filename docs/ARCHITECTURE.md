# Architecture

Battleship Online is a server-authoritative, real-time multiplayer game. The browser never decides
anything that matters: it renders snapshots produced by the server and sends requests that the server
validates. This document explains the moving parts and the reasoning behind them.

## Monorepo layout

```
packages/
  shared/   @battleship/shared  – constants, types, pure game engine, AI opponents, socket protocol + zod schemas
  server/   @battleship/server  – Express 5 (REST) + Socket.IO (realtime) + Prisma/PostgreSQL (persistence)
  client/   @battleship/client  – React 19 + Vite + Tailwind CSS v4 + Motion + socket.io-client
```

`@battleship/shared` is consumed as TypeScript source by both sides (Vite compiles it for the browser,
`tsx` runs it in development and `esbuild` bundles it into `packages/server/dist/index.js` for production).
Keeping the engine and protocol in one package guarantees that client previews (e.g. "can this ship go
here?") and server validation use the exact same rules.

## Domain model

| Concept | Where | Notes |
| --- | --- | --- |
| Board / fleet rules | `shared/src/engine/placement.ts` | `validateFleet`, `canPlace`, `rotateShip`, `randomFleet` |
| Shot resolution | `shared/src/engine/board.ts` | `createBoard`, `receiveAttack`, `toMyBoardView`, `toEnemyBoardView` |
| Match statistics / Elo | `shared/src/engine/stats.ts` | `computeMatchStats`, `eloDelta` |
| AI opponents | `shared/src/ai/` | easy / medium / hard – see below |
| Game state machine | `server/src/game/` | `GameSession` + `SessionManager` |
| Matchmaking queue | `server/src/matchmaking/` | FIFO pairing, in-process |
| Socket handlers | `server/src/realtime/` | auth, rate limiting, event handlers |
| Persistence | `server/src/persistence/` | repository interfaces with Prisma and in-memory implementations |
| REST API | `server/src/http/` | auth, profile, stats, leaderboard, match history, health |

## Game state machine

Every game – private room, quick match or practice – is a `GameSession` moving through:

```
WAITING ──▶ PLACING_SHIPS ──▶ READY ──▶ IN_BATTLE ──▶ FINISHED
```

| Phase | Meaning | Transition |
| --- | --- | --- |
| `WAITING` | Private-room lobby. Host waits for a second player; both toggle *ready*. | Both ready → lobby countdown → `PLACING_SHIPS` |
| `PLACING_SHIPS` | Each player submits a fleet (`fleet:confirm`). Fleets are validated and then locked. | Both confirmed → `READY` |
| `READY` | Short countdown; the server picks the first player with a cryptographically fair coin. | Countdown fires → `IN_BATTLE` |
| `IN_BATTLE` | Alternating attacks, one coordinate per turn, with a turn timer. | All 17 enemy cells hit / forfeit / timeout / abandonment → `FINISHED` |
| `FINISHED` | Result + statistics. Both players may request a rematch (creates a *new* game, same room). | — |

Quick-match and practice games are created directly in `PLACING_SHIPS`; only private rooms use the lobby.
Every transition is validated on the server; the client cannot skip or force a phase.

### Timers and edge cases

* **Turn timer** (`TURN_TIMEOUT_MS`, default 45 s): when it expires the turn passes to the opponent.
  `MAX_CONSECUTIVE_TIMEOUTS` skipped turns in a row (default 3) forfeit the match (`TIMEOUT`).
* **Reconnect grace** (`RECONNECT_GRACE_MS`, default 60 s): a player whose last socket disconnects keeps
  their seat. Reconnecting (new tab, page reload, network blip) re-attaches them and re-sends the full
  snapshot. If the grace expires during a battle the match is lost (`ABANDONED`); before the battle the
  room reverts to the lobby (private) or the match is cancelled (quick match, no statistics recorded).
* **Placement timeout** (`PLACEMENT_TIMEOUT_MS`): a game stuck in placement is cancelled.
* **Duplicate / replayed moves**: each attack carries the `moveNumber` the client believes it is making.
  The server rejects anything but the current number (`STALE_MOVE`), so a retried or replayed event can
  never fire twice. Attack handling is synchronous from validation to mutation, so two simultaneous
  events for the same turn cannot both succeed.

## Snapshot personalisation (no fleet leaks)

The server produces a different `GameSnapshot` for each viewer:

* `myBoard` – the viewer's own fleet, incoming shots, per-ship damage.
* `enemyBoard` – only the viewer's own shots (`miss`/`hit`/`sunk`), *sunk* ships with their revealed cells,
  and the list of ship types still afloat.

Unsunk enemy ship positions never leave the server – not in snapshots, events, acknowledgements, REST
responses or browser storage. The AI opponent is subject to the same rule: it receives the same
`EnemyBoardView` a human would see. Automated tests assert that a serialized snapshot for player A contains
none of player B's unsunk cells.

## Realtime protocol

See [PROTOCOL.md](./PROTOCOL.md) for the complete event list. Design points:

* Every client → server event is acknowledged with `{ ok: true, ... }` or `{ ok: false, error: { code, message } }`.
* After each state change the server pushes a fresh personalised `game:state` snapshot plus a small
  `game:event` describing what happened (used for animations and sounds). The client is therefore
  snapshot-driven and trivially resumable: on (re)connect it receives `session:state` with the current game.
* Payloads are validated with the zod schemas in `shared/src/protocol.ts`; malformed input is rejected with
  `INVALID_PAYLOAD` and can never crash the server.
* Rate limiting: a per-user token bucket for all socket events, a stricter bucket for `room:join`
  (brute-forcing a 6-character, 32-symbol room code is impractical), plus HTTP rate limits.

## Matchmaking and rooms

* **Quick match** – `queue:join` puts the user in a FIFO queue; the first two distinct users are paired
  into a `QUICK` game. Leaving the queue or disconnecting removes the entry. Pairing is in-process; for a
  multi-instance deployment move the queue (and the Socket.IO adapter) to Redis.
* **Private rooms** – `room:create` creates a `PRIVATE` game with a random 6-character code drawn from an
  unambiguous alphabet (no `0/O/1/I`) using `crypto.randomBytes`. The invite link is `/join/<code>`.
* **Practice** – `practice:start` creates a `PRACTICE` game whose opponent is a server-side AI.

## AI opponents

| Level | Strategy |
| --- | --- |
| Easy | Mostly random shots; follows up on hits only half of the time. |
| Medium | Classic hunt/target: parity hunting, then extends lines of hits in both directions. |
| Hard | Probability-density targeting: enumerates every placement of each remaining ship consistent with the known misses/hits/sunk ships and fires at the most likely cell, prioritising unresolved hits. |

The AI is a pure function of the board view (`chooseShot(view)`), seeded by an RNG for deterministic tests.

## Persistence

Repository interfaces (`server/src/persistence/types.ts`) decouple the game server from storage:

* **Prisma + PostgreSQL** (`DATABASE_URL` set) – users, player statistics, matches, participants, achievements.
* **In-memory** (no `DATABASE_URL`) – same behaviour, data resets on restart. Used for local development
  without a database and by most automated tests.

Match recording is transactional: the match row, both participants, each human's statistics (W/L,
accuracy counters, streaks, Elo rating for online modes) and achievement unlocks are written together.
Practice games are recorded separately (`practiceGames` / `practiceWins`) and do not affect rating.

## Authentication

* First visit → `POST /api/auth/guest` creates a guest identity and returns a signed JWT (HS256, `jose`).
* Guests can upgrade to an account (`POST /api/auth/register` with the guest token) keeping their id,
  statistics and history. Passwords are hashed with bcrypt.
* The token is sent as a bearer header to the REST API and as `auth.token` on the socket handshake.
  Invalid or expired tokens are rejected before any handler runs.

## Client

* `lib/store.ts` – a single zustand store (auth, connection, current snapshot, queue, settings, toasts).
* `lib/socket.ts` – the typed socket, event wiring, and `rt.*` request helpers with timeouts.
* `screens/GameScreen.tsx` – chooses Lobby / Placement / Battle / Results purely from `snapshot.phase`.
* `components/board/*` – one responsive `Grid` + `Cell` + `ShipSprite` set shared by every board.
* Sounds are synthesised with the Web Audio API (no asset downloads) and can be muted in Settings.
