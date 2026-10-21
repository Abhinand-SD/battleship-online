import type http from 'node:http';
import type { Rng, SessionState, UserProfile } from '@battleship/shared';
import { Server } from 'socket.io';
import type { AppDeps, RuntimeStats } from '../deps';
import type { PlayerIndex } from '../game/GameSession';
import { SessionManager } from '../game/SessionManager';
import { buildSnapshot } from '../game/snapshot';
import { createRealClock, type Clock } from '../game/timers';
import { Matchmaker } from '../matchmaking/Matchmaker';
import type { UserRecord } from '../persistence/types';
import { createSocketAuth, type TypedServer } from './auth';
import { broadcastGame, userRoom } from './broadcast';
import { registerHandlers, type RealtimeContext } from './handlers';
import { KeyedRateLimiter } from './rateLimit';

export type { TypedServer, TypedSocket } from './auth';

export interface Realtime {
  io: TypedServer;
  stats(): RuntimeStats;
  close(): Promise<void>;
  /** The game registry behind the socket layer (diagnostics and tests). */
  sessions: SessionManager;
  matchmaker: Matchmaker;
}

/** Optional injection points; production uses the defaults. */
export interface RealtimeOptions {
  clock?: Clock;
  rng?: Rng;
  fairCoin?: () => PlayerIndex;
}

export function toUserProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    isGuest: user.isGuest,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Attaches the Socket.IO realtime layer to an HTTP server: authentication, presence (user rooms),
 * the game session manager, matchmaking and rate limiting.
 */
export function createRealtime(server: http.Server, deps: AppDeps, options: RealtimeOptions = {}): Realtime {
  const log = deps.logger.child({ module: 'realtime' });
  const clock = options.clock ?? createRealClock();
  const { config } = deps;

  const io: TypedServer = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  /** userId -> live socket ids. A user counts as connected while this has an entry. */
  const presence = new Map<string, Set<string>>();

  const manager = new SessionManager({
    timings: config.timings,
    logger: deps.logger.child({ module: 'game' }),
    repos: deps.repos,
    clock,
    rng: options.rng,
    fairCoin: options.fairCoin,
    isOnline: (userId) => presence.has(userId),
    notifier: {
      gameChanged: (session, events) => broadcastGame(io, session, events),
      gameClosed: (userId, gameId, reason) => io.to(userRoom(userId)).emit('game:closed', { gameId, reason }),
    },
  });

  const matchmaker = new Matchmaker({
    manager,
    clock,
    logger: deps.logger.child({ module: 'matchmaking' }),
    notifier: { queueChanged: (userId, status) => io.to(userRoom(userId)).emit('queue:status', status) },
  });

  const eventLimiter = new KeyedRateLimiter({ capacity: config.SOCKET_EVENTS_PER_10S, windowMs: 10_000, clock });
  const joinLimiter = new KeyedRateLimiter({ capacity: config.ROOM_JOIN_ATTEMPTS_PER_MIN, windowMs: 60_000, clock });

  const sessionState = async (userId: string): Promise<SessionState | null> => {
    const user = await deps.repos.users.findById(userId);
    if (!user) return null;
    const session = manager.getUserSession(userId);
    return {
      user: toUserProfile(user),
      game: session ? buildSnapshot(session, userId) : null,
      queue: matchmaker.status(userId),
      serverTime: clock.now(),
    };
  };

  const ctx: RealtimeContext = { deps, log, clock, manager, matchmaker, eventLimiter, joinLimiter, sessionState };

  io.use(createSocketAuth(deps));

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    void socket.join(userRoom(userId));

    let sockets = presence.get(userId);
    const firstSocket = !sockets;
    if (!sockets) {
      sockets = new Set();
      presence.set(userId, sockets);
    }
    sockets.add(socket.id);
    log.info({ userId, socketId: socket.id, sockets: sockets.size, onlineUsers: presence.size }, 'socket connected');

    if (firstSocket) manager.setUserConnected(userId, true);
    deps.repos.users.touchLastSeen(userId).catch((err: unknown) => log.debug({ err, userId }, 'touchLastSeen failed'));

    registerHandlers(socket, ctx);

    sessionState(userId)
      .then((state) => {
        if (state && socket.connected) socket.emit('session:state', state);
      })
      .catch((err: unknown) => log.error({ err, userId }, 'failed to send session state'));

    socket.on('disconnect', (reason) => {
      const set = presence.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) presence.delete(userId);
      }
      const lastSocket = !presence.has(userId);
      log.info({ userId, socketId: socket.id, reason, lastSocket }, 'socket disconnected');
      if (lastSocket) {
        manager.setUserConnected(userId, false);
        matchmaker.remove(userId);
        // Only full buckets are dropped, so reconnecting never resets a user's budget.
        eventLimiter.prune();
        joinLimiter.prune();
      }
    });
  });

  const stats = (): RuntimeStats => ({
    connectedSockets: io.sockets.sockets.size,
    onlineUsers: presence.size,
    activeGames: manager.liveGameCount(),
    queueLength: matchmaker.size,
  });

  const close = async (): Promise<void> => {
    log.info(stats(), 'closing realtime layer');
    matchmaker.clear();
    manager.close();
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
    presence.clear();
    await manager.whenIdle();
  };

  return { io, stats, close, sessions: manager, matchmaker };
}
