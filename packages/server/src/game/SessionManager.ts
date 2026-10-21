import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type AiDifficulty, type Coord, type Fleet, type Rng } from '@battleship/shared';
import type { Logger } from '../logger';
import type { MatchRecordInput, Repositories } from '../persistence/types';
import {
  GameSession,
  cryptoFairCoin,
  type AttackOutcome,
  type GameSessionInit,
  type PlayerIndex,
  type PlayerInit,
  type RemovalCause,
  type SessionEvent,
  type SessionHost,
} from './GameSession';
import { buildMatchRecordInput } from './matchRecord';
import { createRealClock, type Clock } from './timers';
import { fail, ok, profileFromRecord, type Failure, type GameTimings, type PlayerProfile, type Result } from './types';

/** How the manager reports game changes to the transport layer. */
export interface SessionNotifier {
  /** Broadcast fresh personalised snapshots (+ events) to every human participant. */
  gameChanged(session: GameSession, events: SessionEvent[]): void;
  /** The user is no longer a participant of the game (left, removed after grace, ...). */
  gameClosed(userId: string, gameId: string, reason: RemovalCause): void;
}

export interface SessionManagerOptions {
  timings: GameTimings;
  logger: Logger;
  repos: Pick<Repositories, 'users' | 'stats' | 'matches'>;
  notifier: SessionNotifier;
  /** Defaults to real timers. */
  clock?: Clock;
  /** Random source for the AI and AI fleets (defaults to Math.random). */
  rng?: Rng;
  /** Coin flip for the first turn (defaults to crypto randomness). */
  fairCoin?: () => PlayerIndex;
  /** Whether a user currently has a live socket. Defaults to "yes". */
  isOnline?: (userId: string) => boolean;
}

/**
 * Owns every live game: gameId -> session, roomCode -> current gameId, userId -> current gameId.
 * A user is in at most one game at a time. All mutating calls are synchronous (except `rematch`, which
 * refreshes player profiles before creating the follow-up game).
 */
export class SessionManager {
  readonly clock: Clock;
  private readonly sessions = new Map<string, GameSession>();
  private readonly roomCodes = new Map<string, string>();
  private readonly userGames = new Map<string, string>();
  private readonly host: SessionHost;
  private readonly log: Logger;
  private readonly isOnline: (userId: string) => boolean;
  private readonly inflight = new Set<Promise<void>>();
  private closed = false;

  constructor(private readonly options: SessionManagerOptions) {
    this.clock = options.clock ?? createRealClock();
    this.log = options.logger;
    this.isOnline = options.isOnline ?? (() => true);
    this.host = {
      clock: this.clock,
      timings: options.timings,
      rng: options.rng ?? Math.random,
      fairCoin: options.fairCoin ?? cryptoFairCoin,
      onChange: (session, events) => options.notifier.gameChanged(session, events),
      onFinished: (session) => this.handleFinished(session),
      onPlayerRemoved: (session, userId, cause) => this.handlePlayerRemoved(session, userId, cause),
      onEmpty: (session) => this.deleteSession(session),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------------------------

  getSession(gameId: string): GameSession | null {
    return this.sessions.get(gameId) ?? null;
  }

  /** The user's current game (live or finished-but-not-left), or null. */
  getUserSession(userId: string): GameSession | null {
    const gameId = this.userGames.get(userId);
    if (!gameId) return null;
    const session = this.sessions.get(gameId);
    if (!session || !session.hasPlayer(userId)) {
      this.userGames.delete(userId);
      return null;
    }
    return session;
  }

  getSessionByCode(code: string): GameSession | null {
    const gameId = this.roomCodes.get(code);
    return gameId ? (this.sessions.get(gameId) ?? null) : null;
  }

  /** Games that have not finished. */
  liveGameCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.isLive()) n++;
    return n;
  }

  get size(): number {
    return this.sessions.size;
  }

  /** Loads the data a player carries into a game (profile + current rating). */
  async loadProfile(userId: string): Promise<PlayerProfile | null> {
    const user = await this.options.repos.users.findById(userId);
    if (!user) return null;
    const stats = await this.options.repos.stats.getStats(userId);
    return profileFromRecord(user, stats.rating);
  }

  /**
   * Guarantees the user can enter a new game: fails with ALREADY_IN_GAME while they are in a live game;
   * a finished game (or a stale mapping) is left automatically.
   */
  ensureFree(userId: string): Failure | null {
    const current = this.getUserSession(userId);
    if (!current) return null;
    if (current.isLive()) return fail('ALREADY_IN_GAME', 'You are already in a game. Leave it first.');
    current.leave(userId);
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // Creating / joining games
  // ---------------------------------------------------------------------------------------------

  createPrivateRoom(profile: PlayerProfile): Result<GameSession> {
    const blocked = this.ensureFree(profile.userId);
    if (blocked) return blocked;
    const session = this.createSession({
      mode: 'PRIVATE',
      roomCode: this.generateRoomCode(),
      players: [{ kind: 'human', profile, connected: this.isOnline(profile.userId) }, null],
      initialPhase: 'WAITING',
    });
    return ok(session);
  }

  joinRoom(profile: PlayerProfile, code: string): Result<GameSession> {
    const session = this.getSessionByCode(code);
    if (!session) return fail('ROOM_NOT_FOUND', 'No room with that code exists.');
    // Reconnecting via the invite link: just hand back the game.
    if (session.hasPlayer(profile.userId)) return ok(session);
    if (session.phase !== 'WAITING' || session.playerCount() >= 2) return fail('ROOM_FULL', 'This room is full.');
    const blocked = this.ensureFree(profile.userId);
    if (blocked) return blocked;
    const joined = session.join(profile, this.isOnline(profile.userId));
    if (!joined.ok) return joined;
    this.userGames.set(profile.userId, session.id);
    this.log.info({ gameId: session.id, roomCode: code, userId: profile.userId }, 'player joined room');
    return ok(session);
  }

  /** Pairs two queued players. Both must be free (the matchmaker checks before calling). */
  createQuickMatch(a: PlayerProfile, b: PlayerProfile): Result<GameSession> {
    if (a.userId === b.userId) return fail('INTERNAL', 'Cannot match a player with themselves.');
    const blockedA = this.ensureFree(a.userId);
    if (blockedA) return blockedA;
    const blockedB = this.ensureFree(b.userId);
    if (blockedB) return blockedB;
    const session = this.createSession({
      mode: 'QUICK',
      roomCode: null,
      players: [
        { kind: 'human', profile: a, connected: this.isOnline(a.userId) },
        { kind: 'human', profile: b, connected: this.isOnline(b.userId) },
      ],
      initialPhase: 'PLACING_SHIPS',
    });
    return ok(session);
  }

  createPractice(profile: PlayerProfile, difficulty: AiDifficulty): Result<GameSession> {
    const blocked = this.ensureFree(profile.userId);
    if (blocked) return blocked;
    const session = this.createSession({
      mode: 'PRACTICE',
      roomCode: null,
      players: [{ kind: 'human', profile, connected: this.isOnline(profile.userId) }, { kind: 'ai', difficulty }],
      initialPhase: 'PLACING_SHIPS',
    });
    return ok(session);
  }

  // ---------------------------------------------------------------------------------------------
  // In-game actions (delegated to the user's current session)
  // ---------------------------------------------------------------------------------------------

  setReady(userId: string, ready: boolean): Result {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    return session.setReady(userId, ready);
  }

  confirmFleet(userId: string, fleet: Fleet): Result {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    return session.confirmFleet(userId, fleet);
  }

  attack(userId: string, coord: Coord, moveNumber: number): Result<AttackOutcome> {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    return session.attack(userId, coord, moveNumber);
  }

  forfeit(userId: string): Result {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    return session.forfeit(userId);
  }

  leave(userId: string): Result {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    return session.leave(userId);
  }

  async rematch(userId: string, accept: boolean): Promise<Result> {
    const session = this.getUserSession(userId);
    if (!session) return notInGame();
    const voted = session.requestRematch(userId, accept);
    if (!voted.ok) return voted;
    if (voted.value.start) await this.startRematch(session);
    return ok(undefined);
  }

  /** User-level connectivity changed (first socket connected / last socket gone). */
  setUserConnected(userId: string, connected: boolean): void {
    this.getUserSession(userId)?.setConnected(userId, connected);
  }

  /** Resolves once pending persistence work has settled (tests / graceful shutdown). */
  async whenIdle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  /** Clears every timer and forgets all games. */
  close(): void {
    this.closed = true;
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    this.roomCodes.clear();
    this.userGames.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private createSession(init: GameSessionInit): GameSession {
    if (this.closed) throw new Error('SessionManager is closed');
    const session = new GameSession(this.host, init);
    this.register(session);
    this.log.info(
      {
        gameId: session.id,
        mode: session.mode,
        roomCode: session.roomCode,
        players: session.seats().map(([, s]) => s.userId ?? `ai:${s.aiDifficulty}`),
      },
      'game created',
    );
    session.begin();
    return session;
  }

  private register(session: GameSession): void {
    this.sessions.set(session.id, session);
    if (session.roomCode) this.roomCodes.set(session.roomCode, session.id);
    for (const [, slot] of session.humanSeats()) this.userGames.set(slot.userId, session.id);
  }

  private deleteSession(session: GameSession): void {
    session.dispose();
    this.sessions.delete(session.id);
    if (session.roomCode && this.roomCodes.get(session.roomCode) === session.id) this.roomCodes.delete(session.roomCode);
    for (const [userId, gameId] of this.userGames) if (gameId === session.id) this.userGames.delete(userId);
    this.log.debug({ gameId: session.id }, 'game deleted');
  }

  private handlePlayerRemoved(session: GameSession, userId: string, cause: RemovalCause): void {
    if (this.userGames.get(userId) === session.id) this.userGames.delete(userId);
    this.log.debug({ gameId: session.id, userId, cause, phase: session.phase }, 'player removed');
    this.options.notifier.gameClosed(userId, session.id, cause);
  }

  private handleFinished(session: GameSession): void {
    const result = session.result;
    this.log.info(
      {
        gameId: session.id,
        mode: session.mode,
        reason: result?.reason,
        winner: result?.winner === null || result?.winner === undefined ? null : result.participants[result.winner]?.userId,
        durationMs: result?.durationMs,
        moves: session.history.length,
      },
      'game finished',
    );
    const input = buildMatchRecordInput(session);
    if (!input) return;
    const task = this.persist(session, input).finally(() => this.inflight.delete(task));
    this.inflight.add(task);
  }

  private async persist(session: GameSession, input: MatchRecordInput): Promise<void> {
    try {
      const outcome = await this.options.repos.matches.recordMatch(input);
      session.applyOutcome(outcome);
      this.log.debug({ gameId: session.id, participants: outcome.participants.length }, 'match recorded');
    } catch (err) {
      this.log.error({ err, gameId: session.id }, 'failed to record match');
      // Clients still get a final snapshot (without rating changes).
      session.touch();
    }
  }

  /** Both seats agreed: create the follow-up game with refreshed profiles and retire the old one. */
  private async startRematch(old: GameSession): Promise<void> {
    const inits: [PlayerInit | null, PlayerInit | null] = [null, null];
    for (const [idx, slot] of old.seats()) {
      if (slot.isAi) {
        inits[idx] = { kind: 'ai', difficulty: slot.aiDifficulty ?? 'medium' };
        continue;
      }
      const userId = slot.userId!;
      let profile: PlayerProfile | null = null;
      try {
        profile = await this.loadProfile(userId);
      } catch (err) {
        this.log.warn({ err, userId }, 'could not refresh profile for rematch; using cached data');
      }
      profile ??= { userId, displayName: slot.displayName, avatar: slot.avatar, isGuest: slot.isGuest, rating: slot.rating };
      inits[idx] = { kind: 'human', profile, connected: this.isOnline(userId) };
    }
    // Re-validate: players may have left while profiles were loading.
    if (
      this.closed ||
      old.disposed ||
      old.phase !== 'FINISHED' ||
      old.playerCount() !== 2 ||
      !old.bothRematchRequested() ||
      !inits[0] ||
      !inits[1]
    ) {
      if (!old.disposed) old.cancelRematch();
      return;
    }
    // Retire the old game silently: the new snapshot supersedes it for both players.
    old.dispose();
    this.sessions.delete(old.id);
    const next = this.createSession({
      mode: old.mode,
      roomCode: old.roomCode,
      players: [inits[0], inits[1]],
      initialPhase: 'PLACING_SHIPS',
    });
    this.log.info({ gameId: next.id, previousGameId: old.id }, 'rematch started');
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      if (!this.roomCodes.has(code)) return code;
    }
    throw new Error('Unable to allocate a unique room code');
  }
}

function notInGame(): Failure {
  return fail('NOT_IN_GAME', 'You are not in a game.');
}
