import type { IncomingHttpHeaders } from 'node:http';
import type { ApiError, ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '@battleship/shared';
import type { ExtendedError, Server, Socket } from 'socket.io';
import type { AppDeps } from '../deps';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Reads the bearer token from the handshake: `auth.token` first, then an `Authorization` header. */
export function extractToken(handshake: { auth: Record<string, unknown>; headers: IncomingHttpHeaders }): string | null {
  const fromAuth = handshake.auth?.['token'];
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const header = handshake.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function unauthorized(message: string): ExtendedError {
  const err: ExtendedError = new Error('UNAUTHORIZED');
  const data: ApiError = { code: 'UNAUTHORIZED', message };
  err.data = data;
  return err;
}

/**
 * Socket.IO middleware: verifies the handshake token and loads the user. Rejected connections receive a
 * `connect_error` whose message is `UNAUTHORIZED` (with `data.code === 'UNAUTHORIZED'`).
 */
export function createSocketAuth(deps: Pick<AppDeps, 'tokens' | 'repos' | 'logger'>) {
  const log = deps.logger.child({ module: 'realtime:auth' });
  return (socket: TypedSocket, next: (err?: ExtendedError) => void): void => {
    void (async () => {
      try {
        const token = extractToken(socket.handshake);
        if (!token) return next(unauthorized('Missing auth token.'));
        const verified = await deps.tokens.verify(token);
        if (!verified) return next(unauthorized('Invalid or expired token.'));
        const user = await deps.repos.users.findById(verified.userId);
        if (!user) return next(unauthorized('Unknown user.'));
        socket.data.userId = user.id;
        next();
      } catch (err) {
        log.warn({ err, socketId: socket.id }, 'socket authentication failed');
        next(unauthorized('Authentication failed.'));
      }
    })();
  };
}
