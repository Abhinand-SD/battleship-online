import type { ApiError } from '@battleship/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { AppDeps } from '../deps';
import { AppError } from '../http/errors';
import { formatZodIssues } from '../http/validate';
import { RecordNotFoundError, UsernameTakenError } from '../persistence/errors';

interface MappedError {
  status: number;
  body: ApiError;
}

/** Errors thrown by body-parser / http-errors carry a numeric status and an `expose` flag. */
function httpErrorStatus(err: unknown): { status: number; expose: boolean; type: string | undefined; message: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { status?: unknown; statusCode?: unknown; expose?: unknown; type?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status === null || status < 400 || status > 599) return null;
  return {
    status,
    expose: e.expose === true,
    type: typeof e.type === 'string' ? e.type : undefined,
    message: typeof e.message === 'string' ? e.message : '',
  };
}

export function mapError(err: unknown, isProduction: boolean): MappedError {
  if (err instanceof AppError) return { status: err.status, body: err.toApiError() };
  if (err instanceof UsernameTakenError) return { status: 409, body: { code: 'USERNAME_TAKEN', message: err.message } };
  if (err instanceof RecordNotFoundError) return { status: 404, body: { code: 'NOT_FOUND', message: err.message } };
  if (err instanceof ZodError) {
    return { status: 400, body: { code: 'INVALID_PAYLOAD', message: 'Invalid payload', details: { issues: formatZodIssues(err) } } };
  }

  const http = httpErrorStatus(err);
  if (http) {
    if (http.type === 'entity.parse.failed') return { status: 400, body: { code: 'INVALID_PAYLOAD', message: 'Malformed JSON body' } };
    if (http.type === 'entity.too.large') return { status: 413, body: { code: 'INVALID_PAYLOAD', message: 'Request body too large' } };
    if (http.status === 404) return { status: 404, body: { code: 'NOT_FOUND', message: 'Not found' } };
    if (http.status < 500) {
      return { status: http.status, body: { code: 'INVALID_PAYLOAD', message: http.expose && http.message ? http.message : 'Bad request' } };
    }
  }

  const message = !isProduction && err instanceof Error && err.message ? err.message : 'Internal server error';
  return { status: 500, body: { code: 'INTERNAL', message } };
}

/** JSON 404 for anything no route claimed. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } satisfies ApiError });
};

/** Final error handler: consistent `{ error }` bodies, internals hidden in production, 5xx logged. */
export function createErrorHandler(deps: Pick<AppDeps, 'logger' | 'config'>): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const mapped = mapError(err, deps.config.isProduction);
    if (mapped.status >= 500) {
      deps.logger.error({ err, method: req.method, path: req.originalUrl }, 'Unhandled request error');
    }
    res.status(mapped.status).json({ error: mapped.body });
  };
}
