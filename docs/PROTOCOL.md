# Realtime protocol

Transport: Socket.IO 4 (WebSocket with long-polling fallback), path `/socket.io`.
Authentication: `io(url, { auth: { token } })` – the JWT obtained from `POST /api/auth/guest`,
`/register` or `/login`. Connections without a valid token are refused (`UNAUTHORIZED`).

All types and zod schemas live in `packages/shared/src/protocol.ts` and `types.ts`.

## Acknowledgements

Every client → server event takes an ack callback as its last argument and receives:

```ts
{ ok: true, ...payload } | { ok: false, error: { code: ErrorCode, message: string, details?: unknown } }
```

Error codes: `UNAUTHORIZED, FORBIDDEN, INVALID_PAYLOAD, RATE_LIMITED, ROOM_NOT_FOUND, ROOM_FULL,
ALREADY_IN_GAME, NOT_IN_GAME, ALREADY_IN_QUEUE, NOT_IN_QUEUE, WRONG_PHASE, NOT_YOUR_TURN,
CELL_ALREADY_ATTACKED, STALE_MOVE, INVALID_FLEET, FLEET_LOCKED, OPPONENT_LEFT, INTERNAL`.

## Client → server

| Event | Payload | Ack payload | Notes |
| --- | --- | --- | --- |
| `session:sync` | – | `{ state: SessionState }` | Also pushed automatically as `session:state` on connect. |
| `room:create` | – | `{ code, game }` | Creates a private room (game in `WAITING`). |
| `room:join` | `{ code }` | `{ code, game }` | Code is normalised (case/dashes ignored). Rate limited. |
| `room:ready` | `{ ready }` | – | Lobby ready flag. Both ready → countdown → placement. |
| `queue:join` | – | `{ status }` | Quick-match queue. Pairs immediately when possible. |
| `queue:leave` | – | `{ status }` | |
| `practice:start` | `{ difficulty: 'easy'|'medium'|'hard' }` | `{ game }` | Game vs the server-side AI. |
| `fleet:confirm` | `{ fleet: ShipPlacement[5] }` | – | Validated structurally (zod) and by the engine. Locked after success. |
| `game:attack` | `{ x, y, moveNumber }` | `{ outcome, gameOver }` | `moveNumber` must equal the snapshot's `moveNumber`. |
| `game:forfeit` | – | – | Only during `IN_BATTLE`. |
| `game:rematch` | `{ accept }` | – | Both must accept; creates a new game. |
| `game:leave` | – | – | Leaves the room/game (forfeits an active battle). |

## Server → client

| Event | Payload | When |
| --- | --- | --- |
| `session:state` | `SessionState { user, game, queue, serverTime }` | On connect / reconnect. |
| `game:state` | `GameSnapshot` | After every state change (personalised per viewer). |
| `game:event` | `GameEvent` | Alongside snapshots: `shot`, `turn`, `phase`, `opponent_connection`, `opponent_joined`, `opponent_left`, `rematch_requested`, `finished`. |
| `game:closed` | `{ gameId, reason }` | The game no longer exists for this user. |
| `queue:status` | `QueueStatus` | Queue membership changed. |
| `server:error` | `ApiError` | Out-of-band error. |

## GameSnapshot (abridged)

```ts
{
  gameId, roomCode, mode: 'QUICK'|'PRIVATE'|'PRACTICE',
  phase: 'WAITING'|'PLACING_SHIPS'|'READY'|'IN_BATTLE'|'FINISHED',
  me:       { id, displayName, avatar, rating, connected, ready, fleetConfirmed, ... },
  opponent: { ...same, isAi, aiDifficulty } | null,
  myBoard:  { fleet, shots, sunk, hits },          // full knowledge of my own board
  enemyBoard: { shots, sunkShips, remaining },     // never contains unsunk enemy positions
  turn: 'me'|'opponent'|null, moveNumber, turnDeadline, countdownEndsAt,
  startedAt, endedAt, history: ShotRecord[], result, rematch,
  opponentReconnectDeadline, serverTime
}
```

Timestamps are epoch milliseconds from the server clock; the client calibrates with `serverTime`.

## REST API

| Method & path | Auth | Description |
| --- | --- | --- |
| `POST /api/auth/guest` | – | Create a guest identity → `{ token, user }` |
| `POST /api/auth/register` | optional | Create an account (upgrades the guest whose token is sent) |
| `POST /api/auth/login` | – | Sign in → `{ token, user }` |
| `GET /api/me` / `PATCH /api/me` | ✔ | Profile read / update (`displayName`, `avatar`) |
| `GET /api/stats/me` | ✔ | `{ stats, rank }` |
| `GET /api/users/:id` | – | Public profile + stats |
| `GET /api/leaderboard?limit=&offset=` | – | Ranked players (online matches only) |
| `GET /api/matches/me?limit=` | ✔ | Match history |
| `GET /api/health`, `GET /healthz` | – | Health checks (DB connectivity, runtime counters) |
| `GET /api/stats/online` | – | Online users / active games / queue length |

Errors use the same `{ error: { code, message, details? } }` envelope as socket acks.
