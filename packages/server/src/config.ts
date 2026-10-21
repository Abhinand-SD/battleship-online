import { DEFAULT_TIMINGS } from '@battleship/shared';
import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  /** PostgreSQL connection string. When absent the server runs with an in-memory store (dev/test only). */
  DATABASE_URL: z.string().optional(),
  /** Secret for signing JWTs. Required in production. */
  JWT_SECRET: z.string().min(16).optional(),
  /** Days a token stays valid. */
  JWT_TTL_DAYS: z.coerce.number().positive().default(30),
  /** Comma-separated list of allowed browser origins (CORS). Empty = same-origin only (plus localhost in dev). */
  CORS_ORIGINS: z.string().default(''),
  /** Public URL of the client, used to build invite links. Defaults to the request origin. */
  PUBLIC_URL: z.string().optional(),
  /** Serve the built client from CLIENT_DIST (single-process deployment). */
  SERVE_CLIENT: boolish.default(false),
  CLIENT_DIST: z.string().default('../client/dist'),
  TRUST_PROXY: boolish.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: boolish.optional(),

  LOBBY_COUNTDOWN_MS: z.coerce.number().int().min(0).default(DEFAULT_TIMINGS.lobbyCountdownMs),
  BATTLE_COUNTDOWN_MS: z.coerce.number().int().min(0).default(DEFAULT_TIMINGS.battleCountdownMs),
  TURN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(DEFAULT_TIMINGS.turnTimeoutMs),
  MAX_CONSECUTIVE_TIMEOUTS: z.coerce.number().int().min(1).default(DEFAULT_TIMINGS.maxConsecutiveTimeouts),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(1000).default(DEFAULT_TIMINGS.reconnectGraceMs),
  PLACEMENT_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(DEFAULT_TIMINGS.placementTimeoutMs),
  AI_MOVE_DELAY_MS: z.coerce.number().int().min(0).default(DEFAULT_TIMINGS.aiMoveDelayMs),

  /** HTTP rate limits (requests per window). */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /** Socket events allowed per user per 10 seconds. */
  SOCKET_EVENTS_PER_10S: z.coerce.number().int().positive().default(60),
  ROOM_JOIN_ATTEMPTS_PER_MIN: z.coerce.number().int().positive().default(15),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isTest: boolean;
  corsOrigins: string[];
  timings: {
    lobbyCountdownMs: number;
    battleCountdownMs: number;
    turnTimeoutMs: number;
    maxConsecutiveTimeouts: number;
    reconnectGraceMs: number;
    placementTimeoutMs: number;
    aiMoveDelayMs: number;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const cfg = parsed.data;
  const isProduction = cfg.NODE_ENV === 'production';
  if (isProduction && !cfg.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production (at least 16 characters).');
  }
  const corsOrigins = cfg.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!isProduction) {
    for (const o of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']) {
      if (!corsOrigins.includes(o)) corsOrigins.push(o);
    }
  }
  return {
    ...cfg,
    isProduction,
    isTest: cfg.NODE_ENV === 'test',
    corsOrigins,
    timings: {
      lobbyCountdownMs: cfg.LOBBY_COUNTDOWN_MS,
      battleCountdownMs: cfg.BATTLE_COUNTDOWN_MS,
      turnTimeoutMs: cfg.TURN_TIMEOUT_MS,
      maxConsecutiveTimeouts: cfg.MAX_CONSECUTIVE_TIMEOUTS,
      reconnectGraceMs: cfg.RECONNECT_GRACE_MS,
      placementTimeoutMs: cfg.PLACEMENT_TIMEOUT_MS,
      aiMoveDelayMs: cfg.AI_MOVE_DELAY_MS,
    },
  };
}
