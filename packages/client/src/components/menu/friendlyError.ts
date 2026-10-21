import { errorCodeOf, messageOf } from './errors';

export type ErrorContext = 'generic' | 'join';

/**
 * Maps a failed menu request (SocketRequestError / ApiRequestError or anything carrying a protocol
 * `code`) to a sentence suitable for a toast or inline field error.
 */
export function friendlyError(err: unknown, context: ErrorContext = 'generic'): string {
  switch (errorCodeOf(err)) {
    case 'ROOM_NOT_FOUND':
      return 'No room with that code. Check it with your friend and try again.';
    case 'ROOM_FULL':
      return 'That room is already full.';
    case 'ALREADY_IN_GAME':
      return 'You already have a match in progress.';
    case 'ALREADY_IN_QUEUE':
      return 'You are already searching for a match.';
    case 'NOT_IN_QUEUE':
      return 'You are no longer in the queue.';
    case 'NOT_IN_GAME':
      return 'That match has already ended.';
    case 'OPPONENT_LEFT':
      return 'Your opponent has left that room.';
    case 'RATE_LIMITED':
      return 'Too many requests. Wait a moment and try again.';
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return 'Your session is no longer valid. Reload the page to continue.';
    case 'INVALID_PAYLOAD':
      return context === 'join' ? 'That doesn’t look like a valid room code.' : 'The server rejected that request. Please try again.';
    default:
      return messageOf(err);
  }
}
