import type { RequestHandler } from 'express';
import type { Logger } from '../logger';

/** Logs method, path, status and duration once the response is finished. API calls at info, the rest at debug. */
export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
      const fields = { method: req.method, path, status: res.statusCode, ms };
      if (res.statusCode >= 500) logger.error(fields, 'request failed');
      else if (path.startsWith('/api') && path !== '/api/health') logger.info(fields, 'request');
      else logger.debug(fields, 'request');
    });
    next();
  };
}
