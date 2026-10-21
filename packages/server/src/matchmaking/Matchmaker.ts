import type { QueueStatus } from '@battleship/shared';
import type { GameSession } from '../game/GameSession';
import type { SessionManager } from '../game/SessionManager';
import type { Clock } from '../game/timers';
import { fail, ok, type PlayerProfile, type Result } from '../game/types';
import type { Logger } from '../logger';

export interface QueueEntry {
  profile: PlayerProfile;
  since: number;
}

export interface MatchmakerNotifier {
  queueChanged(userId: string, status: QueueStatus): void;
}

export interface MatchmakerOptions {
  manager: SessionManager;
  clock: Clock;
  logger: Logger;
  notifier: MatchmakerNotifier;
}

/**
 * FIFO quick-match queue. Pairing happens synchronously when a player joins while someone else is
 * waiting, so there is no window in which a player can be matched twice.
 */
export class Matchmaker {
  /** Insertion order is the queue order. */
  private readonly entries = new Map<string, QueueEntry>();

  constructor(private readonly options: MatchmakerOptions) {}

  get size(): number {
    return this.entries.size;
  }

  status(userId: string): QueueStatus {
    const entry = this.entries.get(userId);
    return { inQueue: entry !== undefined, since: entry?.since ?? null, searching: this.entries.size };
  }

  /** Adds the player, or pairs them immediately with the longest-waiting other player. */
  join(profile: PlayerProfile): Result<{ status: QueueStatus; game: GameSession | null }> {
    const { manager, notifier, logger } = this.options;
    const userId = profile.userId;
    if (this.entries.has(userId)) return fail('ALREADY_IN_QUEUE', 'You are already searching for a match.');
    const blocked = manager.ensureFree(userId);
    if (blocked) return blocked;

    for (const [partnerId, entry] of this.entries) {
      if (partnerId === userId) continue; // never pair a user with themselves (multiple tabs)
      this.entries.delete(partnerId);
      if (manager.ensureFree(partnerId)) {
        // Stale entry (the partner entered a game some other way): drop it and keep looking.
        notifier.queueChanged(partnerId, this.status(partnerId));
        continue;
      }
      const game = manager.createQuickMatch(entry.profile, profile);
      if (game.ok) {
        notifier.queueChanged(partnerId, this.status(partnerId));
        notifier.queueChanged(userId, this.status(userId));
        this.broadcast();
        logger.info({ gameId: game.value.id, players: [partnerId, userId], waitedMs: this.options.clock.now() - entry.since }, 'match found');
        return ok({ status: this.status(userId), game: game.value });
      }
      logger.error({ error: game.error, partnerId, userId }, 'quick match creation failed');
      notifier.queueChanged(partnerId, this.status(partnerId));
      break;
    }

    this.entries.set(userId, { profile, since: this.options.clock.now() });
    this.broadcast();
    return ok({ status: this.status(userId), game: null });
  }

  leave(userId: string): Result<{ status: QueueStatus }> {
    if (!this.entries.delete(userId)) return fail('NOT_IN_QUEUE', 'You are not searching for a match.');
    this.options.notifier.queueChanged(userId, this.status(userId));
    this.broadcast();
    return ok({ status: this.status(userId) });
  }

  /** Silent removal (e.g. the user's last socket disconnected). */
  remove(userId: string): boolean {
    if (!this.entries.delete(userId)) return false;
    this.broadcast();
    return true;
  }

  clear(): void {
    this.entries.clear();
  }

  /** The `searching` count changed: update everyone still waiting. */
  private broadcast(): void {
    for (const userId of this.entries.keys()) this.options.notifier.queueChanged(userId, this.status(userId));
  }
}
