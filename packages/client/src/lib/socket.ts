import { io, type Socket } from 'socket.io-client';
import type {
  AiDifficulty,
  ApiError,
  ClientToServerEvents,
  Fleet,
  GameEvent,
  GameSnapshot,
  QueueStatus,
  ServerToClientEvents,
  SessionState,
} from '@battleship/shared';
import { SERVER_URL } from './api';
import { playSound } from './audio';
import { toast, useStore } from './store';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const REQUEST_TIMEOUT_MS = 10_000;

export class SocketRequestError extends Error {
  code: ApiError['code'];
  details?: unknown;
  constructor(error: ApiError) {
    super(error.message);
    this.name = 'SocketRequestError';
    this.code = error.code;
    this.details = error.details;
  }
}

export const socket: AppSocket = io(SERVER_URL || undefined, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 10_000,
  auth: (cb) => cb({ token: useStore.getState().token }),
});

let wired = false;

function applySessionState(state: SessionState): void {
  const s = useStore.getState();
  s.setServerTime(state.serverTime);
  s.setUser(state.user);
  s.setGame(state.game);
  s.setQueue(state.queue);
}

function wire(): void {
  if (wired) return;
  wired = true;

  socket.on('connect', () => {
    useStore.getState().setConnection('connected');
  });
  socket.on('disconnect', (reason) => {
    const store = useStore.getState();
    if (reason === 'io server disconnect') {
      // Server refused us (e.g. token invalidated). Try to reconnect with fresh credentials.
      store.setConnection('disconnected');
      window.setTimeout(() => {
        if (useStore.getState().token) socket.connect();
      }, 1000);
    } else {
      store.setConnection('disconnected');
    }
  });
  socket.io.on('reconnect_attempt', () => {
    useStore.getState().setConnection('connecting');
  });
  socket.on('connect_error', (err) => {
    const message = err.message || '';
    if (/unauthorized|invalid token|jwt/i.test(message)) {
      useStore.getState().setConnection('unauthorized');
      socket.disconnect();
    } else {
      useStore.getState().setConnection('connecting');
    }
  });

  socket.on('session:state', applySessionState);
  socket.on('game:state', (snapshot: GameSnapshot) => {
    const s = useStore.getState();
    s.setServerTime(snapshot.serverTime);
    s.setGame(snapshot);
  });
  socket.on('game:event', (event: GameEvent) => {
    const s = useStore.getState();
    s.pushEvent(event);
    handleEventFeedback(event);
  });
  socket.on('game:closed', ({ reason }) => {
    const s = useStore.getState();
    s.setGame(null);
    if (reason) toast('info', 'Match closed', reason);
  });
  socket.on('queue:status', (status: QueueStatus) => {
    useStore.getState().setQueue(status);
  });
  socket.on('server:error', (error: ApiError) => {
    toast('error', 'Server error', error.message);
  });
}

function handleEventFeedback(event: GameEvent): void {
  switch (event.type) {
    case 'shot':
      if (event.outcome === 'sunk') playSound('sunk');
      else if (event.outcome === 'hit') playSound('hit');
      else playSound('miss');
      break;
    case 'turn':
      if (event.turn === 'me') playSound('turn');
      if (event.reason === 'timeout') toast('warning', event.turn === 'me' ? 'Opponent ran out of time' : 'You ran out of time', 'The turn was skipped.');
      break;
    case 'opponent_connection':
      if (!event.connected) toast('warning', 'Opponent disconnected', 'Waiting for them to reconnect…');
      else toast('success', 'Opponent reconnected');
      break;
    case 'opponent_joined':
      playSound('ping');
      toast('info', 'An opponent joined your room');
      break;
    case 'opponent_left':
      toast('warning', 'Opponent left the room');
      break;
    case 'rematch_requested':
      toast('info', 'Rematch requested', 'Your opponent wants to play again.');
      break;
    case 'finished':
      if (event.winner === 'me') playSound('victory');
      else if (event.winner === 'opponent') playSound('defeat');
      break;
    default:
      break;
  }
}

/** Connects the socket using the token in the store (no-op when already connected). */
export function connectSocket(): void {
  wire();
  if (!useStore.getState().token) return;
  if (socket.connected) return;
  useStore.getState().setConnection('connecting');
  socket.connect();
}

export function disconnectSocket(): void {
  socket.disconnect();
  useStore.getState().setConnection('idle');
}

/** Forces a reconnect, e.g. after the auth token changed. */
export function reconnectSocket(): void {
  wire();
  if (socket.connected) socket.disconnect();
  connectSocket();
}

type C2S = ClientToServerEvents;
type AckResult<E extends keyof C2S> = Parameters<C2S[E]> extends [...infer _Rest, infer AckFn]
  ? AckFn extends (r: infer R) => void
    ? R
    : never
  : never;
type OkResult<E extends keyof C2S> = Extract<AckResult<E>, { ok: true }>;

async function request<E extends keyof C2S>(event: E, ...args: unknown[]): Promise<OkResult<E>> {
  if (!socket.connected) {
    throw new SocketRequestError({ code: 'INTERNAL', message: 'Not connected to the game server yet.' });
  }
  type Loose = { ok: boolean; error?: ApiError } | null | undefined;
  let res: Loose;
  try {
    // Typed emitWithAck with timeout() needs a cast because the ack signature changes shape.
    const emitter = socket.timeout(REQUEST_TIMEOUT_MS) as unknown as {
      emitWithAck: (ev: string, ...a: unknown[]) => Promise<Loose>;
    };
    res = await emitter.emitWithAck(event as string, ...args);
  } catch {
    throw new SocketRequestError({ code: 'INTERNAL', message: 'The server did not respond in time.' });
  }
  if (!res || typeof res !== 'object' || !('ok' in res)) {
    throw new SocketRequestError({ code: 'INTERNAL', message: 'Malformed server response.' });
  }
  if (!res.ok) throw new SocketRequestError(res.error ?? { code: 'INTERNAL', message: 'Request failed' });
  return res as unknown as OkResult<E>;
}

/** Typed request helpers. Each resolves with the `ok: true` payload or throws SocketRequestError. */
export const rt = {
  sync: () => request('session:sync'),
  createRoom: () => request('room:create'),
  joinRoom: (code: string) => request('room:join', { code }),
  setReady: (ready: boolean) => request('room:ready', { ready }),
  joinQueue: () => request('queue:join'),
  leaveQueue: () => request('queue:leave'),
  startPractice: (difficulty: AiDifficulty) => request('practice:start', { difficulty }),
  confirmFleet: (fleet: Fleet) => request('fleet:confirm', { fleet }),
  attack: (x: number, y: number, moveNumber: number) => request('game:attack', { x, y, moveNumber }),
  forfeit: () => request('game:forfeit'),
  rematch: (accept: boolean) => request('game:rematch', { accept }),
  leaveGame: () => request('game:leave'),
};

/** Human friendly message for a failed request. */
export function errorMessage(err: unknown): string {
  if (err instanceof SocketRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
