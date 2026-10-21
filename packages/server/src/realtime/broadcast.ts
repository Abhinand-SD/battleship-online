import type { GameSession, SessionEvent } from '../game/GameSession';
import { buildSnapshotFor, toGameEvent } from '../game/snapshot';
import type { TypedServer } from './auth';

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Sends every human participant a fresh personalised snapshot followed by the viewer-relative events
 * that caused the change. Emitting to a user room reaches all of that user's tabs.
 */
export function broadcastGame(io: TypedServer, session: GameSession, events: SessionEvent[]): void {
  for (const [idx, slot] of session.humanSeats()) {
    const room = userRoom(slot.userId);
    io.to(room).emit('game:state', buildSnapshotFor(session, idx));
    for (const event of events) {
      const wire = toGameEvent(event, session.id, idx);
      if (wire) io.to(room).emit('game:event', wire);
    }
  }
}
