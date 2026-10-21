import type { ErrorCode } from '@battleship/shared';

/**
 * Reads the protocol error code from a `SocketRequestError` / `ApiRequestError` (or anything shaped
 * like one). Duck-typed on purpose so the helpers stay independent from the transport modules.
 */
export function errorCodeOf(err: unknown): ErrorCode | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code as ErrorCode;
  }
  return null;
}

/** True when `err` carries one of the given protocol codes. */
export function isErrorCode(err: unknown, ...codes: ErrorCode[]): boolean {
  const code = errorCodeOf(err);
  return code !== null && codes.includes(code);
}

/** Message for an unknown failure (same contract as `errorMessage` in lib/socket, without the import). */
export function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'Something went wrong';
}
