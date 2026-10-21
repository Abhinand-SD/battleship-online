import {
  attackPayloadSchema,
  fleetConfirmPayloadSchema,
  practiceStartPayloadSchema,
  rematchPayloadSchema,
  roomJoinPayloadSchema,
  roomReadyPayloadSchema,
  type AckResponse,
  type ApiError,
  type ClientToServerEvents,
  type ErrorCode,
  type SessionState,
} from '@battleship/shared';
import type { z } from 'zod';
import type { AppDeps } from '../deps';
import type { SessionManager } from '../game/SessionManager';
import { buildSnapshot } from '../game/snapshot';
import type { Clock } from '../game/timers';
import type { Failure } from '../game/types';
import type { Logger } from '../logger';
import type { Matchmaker } from '../matchmaking/Matchmaker';
import type { TypedSocket } from './auth';
import type { KeyedRateLimiter } from './rateLimit';

export interface RealtimeContext {
  deps: AppDeps;
  log: Logger;
  clock: Clock;
  manager: SessionManager;
  matchmaker: Matchmaker;
  /** Global per-user budget for all events. */
  eventLimiter: KeyedRateLimiter;
  /** Stricter per-user budget for room:join attempts (room-code brute forcing). */
  joinLimiter: KeyedRateLimiter;
  sessionState(userId: string): Promise<SessionState | null>;
}

type EventName = keyof ClientToServerEvents;
type LastParam<T extends (...args: never[]) => unknown> = Parameters<T> extends [...infer _, infer L] ? L : never;
type AckOf<Ev extends EventName> = LastParam<ClientToServerEvents[Ev]>;
/** The response object the ack of `Ev` expects. */
type AckResponseOf<Ev extends EventName> = AckOf<Ev> extends (response: infer R) => void ? R : never;
type HandlerOf<Ev extends EventName> = (payload: unknown) => AckResponseOf<Ev> | Promise<AckResponseOf<Ev>>;

/** Payload-less success ack (the shared `Ack` default type cannot be produced from a literal). */
const OK = { ok: true } as AckResponse;

/** Builds a success ack while keeping the literal `ok: true` type. */
function okAck<T extends object>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}

function failure(code: ErrorCode, message: string, details?: unknown): Failure {
  const error: ApiError = details === undefined ? { code, message } : { code, message, details };
  return { ok: false, error };
}

/** Validates an untrusted payload with a shared zod schema. */
function parse<S extends z.ZodType>(schema: S, payload: unknown): { ok: true; data: z.output<S> } | Failure {
  const result = schema.safeParse(payload);
  if (result.success) return okAck({ data: result.data as z.output<S> });
  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : '';
  return failure('INVALID_PAYLOAD', `${where}${issue?.message ?? 'Invalid payload'}`, {
    issues: result.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
  });
}

/**
 * Registers every client event. Each listener is wrapped so that malformed arguments, missing acks and
 * thrown errors can never crash the server, and so that the per-user token bucket is applied uniformly.
 */
export function registerHandlers(socket: TypedSocket, ctx: RealtimeContext): void {
  const userId = socket.data.userId;
  const log = ctx.log;

  /** Wraps a handler into a robust raw listener: finds the ack, rate limits, validates, catches. */
  const guard = <Ev extends EventName>(event: Ev, handler: HandlerOf<Ev>) => {
    return (...args: unknown[]): void => {
      const last = args[args.length - 1];
      const ack = typeof last === 'function' ? (last as (response: unknown) => void) : null;
      const payload = ack ? (args.length > 1 ? args[0] : undefined) : args[0];
      const reply = (response: unknown): void => {
        if (!ack) return;
        try {
          ack(response);
        } catch (err) {
          log.warn({ err, event, userId }, 'ack callback threw');
        }
      };
      if (!ctx.eventLimiter.allow(userId)) {
        reply(failure('RATE_LIMITED', 'Too many requests. Please slow down.'));
        return;
      }
      let outcome: AckResponseOf<Ev> | Promise<AckResponseOf<Ev>>;
      try {
        outcome = handler(payload);
      } catch (err) {
        log.error({ err, event, userId }, 'socket handler failed');
        reply(failure('INTERNAL', 'Internal server error.'));
        return;
      }
      if (outcome instanceof Promise) {
        outcome.then(reply, (err: unknown) => {
          log.error({ err, event, userId }, 'socket handler failed');
          reply(failure('INTERNAL', 'Internal server error.'));
        });
      } else {
        reply(outcome);
      }
    };
  };

  const loadProfile = async () => {
    const profile = await ctx.manager.loadProfile(userId);
    return profile ?? null;
  };

  socket.on(
    'session:sync',
    guard('session:sync', async () => {
      const state = await ctx.sessionState(userId);
      if (!state) return failure('UNAUTHORIZED', 'This account no longer exists.');
      return okAck({ state });
    }),
  );

  socket.on(
    'room:create',
    guard('room:create', async () => {
      const profile = await loadProfile();
      if (!profile) return failure('UNAUTHORIZED', 'This account no longer exists.');
      const created = ctx.manager.createPrivateRoom(profile);
      if (!created.ok) return created;
      const session = created.value;
      return okAck({ code: session.roomCode ?? '', game: buildSnapshot(session, userId) });
    }),
  );

  socket.on(
    'room:join',
    guard('room:join', async (payload) => {
      if (!ctx.joinLimiter.allow(userId)) return failure('RATE_LIMITED', 'Too many join attempts. Try again in a minute.');
      const parsed = parse(roomJoinPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const profile = await loadProfile();
      if (!profile) return failure('UNAUTHORIZED', 'This account no longer exists.');
      const joined = ctx.manager.joinRoom(profile, parsed.data.code);
      if (!joined.ok) return joined;
      return okAck({ code: parsed.data.code, game: buildSnapshot(joined.value, userId) });
    }),
  );

  socket.on(
    'room:ready',
    guard('room:ready', (payload) => {
      const parsed = parse(roomReadyPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const result = ctx.manager.setReady(userId, parsed.data.ready);
      return result.ok ? OK : result;
    }),
  );

  socket.on(
    'queue:join',
    guard('queue:join', async () => {
      const profile = await loadProfile();
      if (!profile) return failure('UNAUTHORIZED', 'This account no longer exists.');
      const joined = ctx.matchmaker.join(profile);
      if (!joined.ok) return joined;
      return okAck({ status: joined.value.status });
    }),
  );

  socket.on(
    'queue:leave',
    guard('queue:leave', () => {
      const left = ctx.matchmaker.leave(userId);
      if (!left.ok) return left;
      return okAck({ status: left.value.status });
    }),
  );

  socket.on(
    'practice:start',
    guard('practice:start', async (payload) => {
      const parsed = parse(practiceStartPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const profile = await loadProfile();
      if (!profile) return failure('UNAUTHORIZED', 'This account no longer exists.');
      const created = ctx.manager.createPractice(profile, parsed.data.difficulty);
      if (!created.ok) return created;
      return okAck({ game: buildSnapshot(created.value, userId) });
    }),
  );

  socket.on(
    'fleet:confirm',
    guard('fleet:confirm', (payload) => {
      const parsed = parse(fleetConfirmPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const result = ctx.manager.confirmFleet(userId, parsed.data.fleet);
      return result.ok ? OK : result;
    }),
  );

  socket.on(
    'game:attack',
    guard('game:attack', (payload) => {
      // Synchronous from validation to mutation: no await between the checks and the state change.
      const parsed = parse(attackPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const { x, y, moveNumber } = parsed.data;
      const result = ctx.manager.attack(userId, { x, y }, moveNumber);
      if (!result.ok) return result;
      return okAck({ outcome: result.value.outcome, gameOver: result.value.gameOver });
    }),
  );

  socket.on(
    'game:forfeit',
    guard('game:forfeit', () => {
      const result = ctx.manager.forfeit(userId);
      return result.ok ? OK : result;
    }),
  );

  socket.on(
    'game:rematch',
    guard('game:rematch', async (payload) => {
      const parsed = parse(rematchPayloadSchema, payload);
      if (!parsed.ok) return parsed;
      const result = await ctx.manager.rematch(userId, parsed.data.accept);
      return result.ok ? OK : result;
    }),
  );

  socket.on(
    'game:leave',
    guard('game:leave', () => {
      const result = ctx.manager.leave(userId);
      return result.ok ? OK : result;
    }),
  );
}
