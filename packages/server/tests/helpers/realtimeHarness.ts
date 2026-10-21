import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ClientToServerEvents, GameSnapshot, ServerToClientEvents } from '@battleship/shared';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { loadConfig } from '../../src/config';
import type { AppDeps } from '../../src/deps';
import { createLogger } from '../../src/logger';
import type { UserRecord } from '../../src/persistence/types';
import { createRealtime, type Realtime, type RealtimeOptions } from '../../src/realtime';
import { createFakeRepos, type FakeRepositories } from './fakeRepos';
import { createFakeTokens, type FakeTokenService } from './fakeTokens';

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** Fast timings for integration tests; individual tests can override any variable. */
const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  LOBBY_COUNTDOWN_MS: '0',
  BATTLE_COUNTDOWN_MS: '0',
  AI_MOVE_DELAY_MS: '0',
  TURN_TIMEOUT_MS: '5000',
  RECONNECT_GRACE_MS: '1000',
  PLACEMENT_TIMEOUT_MS: '10000',
  SOCKET_EVENTS_PER_10S: '1000',
  ROOM_JOIN_ATTEMPTS_PER_MIN: '100',
};

export interface Harness {
  deps: AppDeps;
  repos: FakeRepositories;
  tokens: FakeTokenService;
  realtime: Realtime;
  server: http.Server;
  url: string;
  users: { alice: UserRecord; bob: UserRecord; carol: UserRecord };
  /** Connects an authenticated client and resolves once connected. */
  connect(userId: string): Promise<TestClient>;
  /** Creates a client with arbitrary auth; does not wait for connection. */
  connectRaw(auth: Record<string, unknown> | undefined): TestClient;
  stop(): Promise<void>;
}

export async function startHarness(overrides: NodeJS.ProcessEnv = {}, options: RealtimeOptions = {}): Promise<Harness> {
  const config = loadConfig({ ...TEST_ENV, ...overrides });
  const logger = createLogger(config);
  const repos = createFakeRepos();
  const tokens = createFakeTokens();
  const deps: AppDeps = {
    config,
    logger,
    repos,
    tokens,
    runtime: { stats: () => ({ connectedSockets: 0, onlineUsers: 0, activeGames: 0, queueLength: 0 }) },
  };
  const users = {
    alice: repos.addUser({ id: 'alice', displayName: 'Alice', avatar: 'anchor', isGuest: false, username: 'alice' }),
    bob: repos.addUser({ id: 'bob', displayName: 'Bob', avatar: 'compass', isGuest: true }),
    carol: repos.addUser({ id: 'carol', displayName: 'Carol', avatar: 'helm', isGuest: true }),
  };

  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const realtime = createRealtime(server, deps, options);
  deps.runtime.stats = () => realtime.stats();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const clients = new Set<TestClient>();
  const connectRaw = (auth: Record<string, unknown> | undefined): TestClient => {
    const socket: TestClient = connectClient(url, {
      auth,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 5000,
    });
    clients.add(socket);
    return socket;
  };
  const connect = async (userId: string): Promise<TestClient> => {
    const socket = connectRaw({ token: tokens.tokenFor(userId) });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (err) => reject(err));
    });
    return socket;
  };

  const stop = async (): Promise<void> => {
    for (const c of clients) c.disconnect();
    clients.clear();
    await realtime.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { deps, repos, tokens, realtime, server, url, users, connect, connectRaw, stop };
}

export class TimeoutError extends Error {}

/** Resolves with the first `event` payload that satisfies `predicate` (default: any). */
export function waitFor<Ev extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: Ev,
  predicate: (payload: Parameters<ServerToClientEvents[Ev]>[0]) => boolean = () => true,
  timeoutMs = 5000,
  label = String(event),
): Promise<Parameters<ServerToClientEvents[Ev]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new TimeoutError(`Timed out waiting for ${label}`));
    }, timeoutMs);
    const listener = (payload: Parameters<ServerToClientEvents[Ev]>[0]): void => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener as never);
      resolve(payload);
    };
    socket.on(event, listener as never);
  });
}

/** Buffers every payload of `event` so tests can assert on history without missing early emissions. */
export function collect<Ev extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: Ev,
): { items: Array<Parameters<ServerToClientEvents[Ev]>[0]>; stop(): void } {
  const items: Array<Parameters<ServerToClientEvents[Ev]>[0]> = [];
  const listener = (payload: Parameters<ServerToClientEvents[Ev]>[0]): void => {
    items.push(payload);
  };
  socket.on(event, listener as never);
  return { items, stop: () => socket.off(event, listener as never) };
}

/** Waits for a snapshot matching `predicate`, considering snapshots that already arrived in `buffer` too. */
export async function waitForState(
  socket: TestClient,
  predicate: (s: GameSnapshot) => boolean,
  buffer?: GameSnapshot[],
  timeoutMs = 5000,
  label = 'game:state',
): Promise<GameSnapshot> {
  if (buffer) {
    for (let i = buffer.length - 1; i >= 0; i--) {
      const s = buffer[i]!;
      if (predicate(s)) return s;
    }
  }
  return waitFor(socket, 'game:state', predicate, timeoutMs, label);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The ack response type of a client event. */
export type AckResponseFor<Ev extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[Ev]> extends [...unknown[], (response: infer R) => void] ? R : never;
/** The payload arguments (everything before the ack) of a client event. */
export type PayloadArgs<Ev extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[Ev]> extends [...infer Rest, (response: never) => void] ? Rest : never;

/** Emits with ack and a timeout so a missing ack fails the test instead of hanging it. */
export function ask<Ev extends keyof ClientToServerEvents>(
  socket: TestClient,
  event: Ev,
  ...args: PayloadArgs<Ev>
): Promise<AckResponseFor<Ev>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`No ack for ${String(event)}`)), 5000);
    const ack = (response: unknown): void => {
      clearTimeout(timer);
      resolve(response as never);
    };
    (socket as ClientSocket).emit(event as string, ...(args as unknown[]), ack);
  });
}
