import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config';

/**
 * helmet + CORS.
 * - API-only deployments keep helmet's defaults.
 * - When the server also serves the client (SERVE_CLIENT) the CSP allows the app itself, inline styles,
 *   Google Fonts, data:/blob: images and WebSocket connections.
 * - CORS: only origins from the allowlist get CORS headers; requests without an Origin header
 *   (same-origin, curl, server-to-server) are always allowed through.
 */
export function createSecurityMiddleware(
  config: Pick<AppConfig, 'SERVE_CLIENT' | 'corsOrigins' | 'isProduction'>,
): RequestHandler[] {
  const helmetMiddleware = helmet(
    config.SERVE_CLIENT
      ? {
          contentSecurityPolicy: {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'base-uri': ["'self'"],
              'script-src': ["'self'"],
              'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
              'img-src': ["'self'", 'data:', 'blob:'],
              'connect-src': ["'self'", 'ws:', 'wss:'],
              'worker-src': ["'self'", 'blob:'],
              'frame-ancestors': ["'none'"],
              'object-src': ["'none'"],
              // Plain-http local deployments must not be forced onto https.
              ...(config.isProduction ? {} : { 'upgrade-insecure-requests': null }),
            },
          },
        }
      : {},
  );

  const allowed = new Set(config.corsOrigins);
  const corsMiddleware = cors({
    origin(origin, callback) {
      callback(null, !origin || allowed.has(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
    credentials: false,
  });

  return [helmetMiddleware, corsMiddleware];
}
