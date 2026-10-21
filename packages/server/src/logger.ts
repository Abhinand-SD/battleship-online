import pino, { type Logger } from 'pino';
import type { AppConfig } from './config';

export type { Logger };

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'LOG_PRETTY' | 'isProduction' | 'isTest'>): Logger {
  const pretty = config.LOG_PRETTY ?? !config.isProduction;
  if (config.isTest) return pino({ level: process.env['LOG_LEVEL'] ?? 'silent' });
  if (pretty) {
    return pino({
      level: config.LOG_LEVEL,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    });
  }
  return pino({ level: config.LOG_LEVEL });
}
