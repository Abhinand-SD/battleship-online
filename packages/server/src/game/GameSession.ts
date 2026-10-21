import { randomInt, randomUUID } from 'node:crypto';
import {
  BOARD_SIZE,
  computeMatchStats,
  createAi,
  createBoard,
  hasBeenAttacked,
  isInsideBoard,
  randomFleet,
  receiveAttack,
  toEnemyBoardView,
  validateFleet,
  type AiDifficulty,
  type AiOpponent,
  type BoardState,
  type Coord,
  type EndReason,
  type Fleet,
  type GameMode,
  type GamePhase,
  type MatchPlayerStats,
  type Rng,
  type ShipType,
  type ShotOutcome,
  type ShotRecord,
  type SunkShip,
} from '@battleship/shared';
import type { MatchRecordOutcome } from '../persistence/types';
import { TimerSlot, type Clock } from './timers';
import { AI_PROFILES, fail, ok, type Failure, type GameTimings, type PlayerProfile, type Result } from './types';

export type PlayerIndex = 0 | 1;

export function otherIndex(i: PlayerIndex): PlayerIndex {
  return i === 0 ? 1 : 0;
}

export type RemovalCause = 'left' | 'disconnected';

/** Server-side state of one seat at the table. Mutated only by `GameSession`. */
export interface PlayerSlot {
  /** null for the AI. */
  userId: string | null;
  isAi: boolean;
  aiDifficulty: AiDifficulty | null;
  ai: AiOpponent | null;
  displayName: string;
  avatar: string;
  isGuest: boolean;
  rating: number;
  connected: boolean;
  /** Lobby ready flag (WAITING). */
  ready: boolean;
  /** Set once the fleet is confirmed (PLACING_SHIPS) — the authoritative board. */
  board: BoardState | null;
  consecutiveTimeouts: number;
  reconnectDeadline: number | null;
  reconnectTimer: TimerSlot;
  rematchRequested: boolean;
  /** Filled in once the match has been persisted. */
  ratingChange: number | null;
  achievements: string[] | null;
}

/** Shot as stored internally: the attacker is an absolute seat index (perspective is applied per viewer). */
export interface InternalShot {
  moveNumber: number;
  attacker: PlayerIndex;
  x: number;
  y: number;
  outcome: ShotOutcome;
  sunk?: ShipType;
  at: number;
}

/** Participant identity captured at finish time (seats may be vacated afterwards). */
export interface FinishedParticipant {
  userId: string | null;
  isAi: boolean;
  aiDifficulty: AiDifficulty | null;
  displayName: string;
  avatar: string;
}

export interface InternalResult {
  winner: PlayerIndex | null;
  reason: EndReason;
  durationMs: number;
  participants: [FinishedParticipant | null, FinishedParticipant | null];
}

/** Events produced by a state change, in absolute (seat index) terms. `toGameEvent` personalises them. */
export type SessionEvent =
  | { type: 'shot'; attacker: PlayerIndex; x: number; y: number; outcome: ShotOutcome; sunk?: SunkShip; moveNumber: number }
  | { type: 'turn'; turn: PlayerIndex; deadline: number | null; reason: 'shot' | 'timeout' | 'start' }
  | { type: 'phase'; phase: GamePhase }
  | { type: 'connection'; player: PlayerIndex; connected: boolean; reconnectDeadline: number | null }
  | { type: 'joined'; player: PlayerIndex }
  | { type: 'left'; player: PlayerIndex }
  | { type: 'rematch_requested'; player: PlayerIndex }
  | { type: 'finished'; winner: PlayerIndex | null; reason: EndReason };

export interface AttackOutcome {
  outcome: ShotOutcome;
  gameOver: boolean;
}

/** What the session needs from its environment. Implemented by the SessionManager. */
export interface SessionHost {
  readonly clock: Clock;
  readonly timings: GameTimings;
  /** Random source for AI shots and AI fleet generation. */
  readonly rng: Rng;
  /** Fair coin deciding who fires first. Crypto-secure in production. */
  fairCoin(): PlayerIndex;
  /** Called once per state change with the events that caused it (snapshots should be broadcast). */
  onChange(session: GameSession, events: SessionEvent[]): void;
  /** Called after the change that finished the game was broadcast (persist the match). */
  onFinished(session: GameSession): void;
  /** A human stopped being a participant of this game. */
  onPlayerRemoved(session: GameSession, userId: string, cause: RemovalCause): void;
  /** No human participant is left: the game must be deleted. */
  onEmpty(session: GameSession): void;
}

export type PlayerInit =
  | { kind: 'human'; profile: PlayerProfile; connected: boolean }
  | { kind: 'ai'; difficulty: AiDifficulty };

export interface GameSessionInit {
  id?: string;
  mode: GameMode;
  roomCode: string | null;
  players: [PlayerInit, PlayerInit | null];
  /** WAITING only for private rooms with a single player; everything else starts in PLACING_SHIPS. */
  initialPhase: 'WAITING' | 'PLACING_SHIPS';
}

export function cryptoFairCoin(): PlayerIndex {
  return randomInt(0, 2) === 0 ? 0 : 1;
}

/**
 * Authoritative state machine for one game: WAITING -> PLACING_SHIPS -> READY -> IN_BATTLE -> FINISHED.
 *
 * Every public operation is synchronous and runs inside a "transaction" (`run`): state is mutated, events
 * are collected, and exactly one `host.onChange` is issued at the end so the manager can broadcast
 * personalised snapshots. Timers are owned by the session and cleared on finish/dispose.
 */
export class GameSession {
  readonly id: string;
  readonly mode: GameMode;
  readonly roomCode: string | null;
  readonly createdAt: number;
  phase: GamePhase;
  /** Fixed seats: indices never shift once a battle has started, so history stays consistent. */
  readonly players: [PlayerSlot | null, PlayerSlot | null];
  turn: PlayerIndex | null = null;
  moveNumber = 1;
  turnDeadline: number | null = null;
  countdownEndsAt: number | null = null;
  startedAt: number | null = null;
  endedAt: number | null = null;
  readonly history: InternalShot[] = [];
  result: InternalResult | null = null;
  /** Set once both players agreed to a rematch, until the new game exists. */
  rematchPending = false;
  disposed = false;

  private readonly countdownTimer: TimerSlot;
  private readonly turnTimer: TimerSlot;
  private readonly placementTimer: TimerSlot;
  private readonly aiTimer: TimerSlot;
  private pending: SessionEvent[] | null = null;
  private afterFlush: Array<() => void> = [];
  private dirty = false;

  constructor(
    private readonly host: SessionHost,
    init: GameSessionInit,
  ) {
    this.id = init.id ?? randomUUID();
    this.mode = init.mode;
    this.roomCode = init.roomCode;
    this.createdAt = host.clock.now();
    this.phase = init.initialPhase;
    this.players = [this.createSlot(init.players[0]), init.players[1] ? this.createSlot(init.players[1]) : null];
    this.countdownTimer = new TimerSlot(host.clock);
    this.turnTimer = new TimerSlot(host.clock);
    this.placementTimer = new TimerSlot(host.clock);
    this.aiTimer = new TimerSlot(host.clock);
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  indexOf(userId: string): PlayerIndex | null {
    if (this.players[0]?.userId === userId) return 0;
    if (this.players[1]?.userId === userId) return 1;
    return null;
  }

  hasPlayer(userId: string): boolean {
    return this.indexOf(userId) !== null;
  }

  /** Occupied seats with their index. */
  seats(): Array<[PlayerIndex, PlayerSlot]> {
    const out: Array<[PlayerIndex, PlayerSlot]> = [];
    if (this.players[0]) out.push([0, this.players[0]]);
    if (this.players[1]) out.push([1, this.players[1]]);
    return out;
  }

  humanSeats(): Array<[PlayerIndex, PlayerSlot & { userId: string }]> {
    return this.seats().filter((s): s is [PlayerIndex, PlayerSlot & { userId: string }] => s[1].userId !== null);
  }

  humanCount(): number {
    return this.humanSeats().length;
  }

  playerCount(): number {
    return this.seats().length;
  }

  isLive(): boolean {
    return this.phase !== 'FINISHED';
  }

  bothRematchRequested(): boolean {
    const [a, b] = this.players;
    return !!a && !!b && (a.isAi || a.rematchRequested) && (b.isAi || b.rematchRequested);
  }

  /** Shot history from the viewpoint of one seat (`by` becomes 'me'/'opponent'). */
  historyFor(viewer: PlayerIndex): ShotRecord[] {
    return this.history.map((h) => {
      const rec: ShotRecord = {
        moveNumber: h.moveNumber,
        by: h.attacker === viewer ? 'me' : 'opponent',
        x: h.x,
        y: h.y,
        outcome: h.outcome,
        at: h.at,
      };
      if (h.sunk) rec.sunk = h.sunk;
      return rec;
    });
  }

  statsFor(viewer: PlayerIndex): MatchPlayerStats {
    return computeMatchStats(this.historyFor(viewer), 'me');
  }

  now(): number {
    return this.host.clock.now();
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------------------------

  /** Must be called once the manager has registered the session: arms timers and broadcasts the first snapshot. */
  begin(): void {
    this.run(() => {
      this.dirty = true;
      if (this.phase === 'PLACING_SHIPS') this.enterPlacing();
      else this.emit({ type: 'phase', phase: this.phase });
      for (const [, slot] of this.humanSeats()) if (!slot.connected) this.startGrace(slot);
    });
  }

  /** Clears every timer. The session must not be used afterwards. */
  dispose(): void {
    this.disposed = true;
    this.clearGameTimers();
    for (const [, slot] of this.seats()) slot.reconnectTimer.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // Lobby (WAITING)
  // ---------------------------------------------------------------------------------------------

  /** Seats a second human in a WAITING private room. */
  join(profile: PlayerProfile, connected: boolean): Result<PlayerIndex> {
    return this.run(() => {
      if (this.phase !== 'WAITING') return fail('ROOM_FULL', 'This room is already in a game.');
      if (this.players[0] && this.players[1]) return fail('ROOM_FULL', 'This room is full.');
      const idx: PlayerIndex = this.players[0] ? 1 : 0;
      const slot = this.createSlot({ kind: 'human', profile, connected });
      this.players[idx] = slot;
      this.dirty = true;
      this.emit({ type: 'joined', player: idx });
      if (!connected) this.startGrace(slot);
      return ok(idx);
    });
  }

  setReady(userId: string, ready: boolean): Result {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      if (this.phase !== 'WAITING') return fail('WRONG_PHASE', 'Ready is only available in the lobby.');
      const slot = this.players[idx]!;
      slot.ready = ready;
      this.dirty = true;
      this.updateLobbyCountdown();
      return ok(undefined);
    });
  }

  private updateLobbyCountdown(): void {
    const [a, b] = this.players;
    const bothReady = !!a && !!b && a.ready && b.ready && a.connected && b.connected;
    if (bothReady && this.countdownEndsAt === null) {
      const ms = this.host.timings.lobbyCountdownMs;
      this.countdownEndsAt = this.now() + ms;
      this.countdownTimer.set(() => this.onLobbyCountdown(), ms);
      this.dirty = true;
    } else if (!bothReady && this.countdownEndsAt !== null) {
      this.countdownEndsAt = null;
      this.countdownTimer.clear();
      this.dirty = true;
    }
  }

  private onLobbyCountdown(): void {
    this.run(() => {
      if (this.phase !== 'WAITING') return;
      this.countdownEndsAt = null;
      this.dirty = true;
      const [a, b] = this.players;
      if (!a || !b || !a.ready || !b.ready || !a.connected || !b.connected) return;
      this.enterPlacing();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Placement (PLACING_SHIPS) and READY countdown
  // ---------------------------------------------------------------------------------------------

  private enterPlacing(): void {
    this.phase = 'PLACING_SHIPS';
    this.countdownEndsAt = null;
    this.countdownTimer.clear();
    for (const [, slot] of this.seats()) {
      slot.ready = false;
      slot.board = null;
      slot.consecutiveTimeouts = 0;
      slot.rematchRequested = false;
    }
    this.placementTimer.set(() => this.onPlacementTimeout(), this.host.timings.placementTimeoutMs);
    this.dirty = true;
    this.emit({ type: 'phase', phase: 'PLACING_SHIPS' });
    // The AI places immediately; its board never leaves the server.
    for (const [, slot] of this.seats()) if (slot.isAi) slot.board = createBoard(randomFleet(this.host.rng));
  }

  private onPlacementTimeout(): void {
    this.run(() => {
      if (this.phase !== 'PLACING_SHIPS') return;
      this.finish('CANCELLED', null);
    });
  }

  confirmFleet(userId: string, fleet: Fleet): Result {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      if (this.phase !== 'PLACING_SHIPS') return fail('WRONG_PHASE', 'Fleets can only be placed during the placement phase.');
      const slot = this.players[idx]!;
      if (slot.board) return fail('FLEET_LOCKED', 'Your fleet is already confirmed.');
      const validation = validateFleet(fleet);
      if (!validation.ok) return fail('INVALID_FLEET', validation.reason, validation.ship ? { ship: validation.ship } : undefined);
      slot.board = createBoard(fleet);
      this.dirty = true;
      const [a, b] = this.players;
      if (a?.board && b?.board) this.enterReady();
      return ok(undefined);
    });
  }

  private enterReady(): void {
    this.placementTimer.clear();
    this.phase = 'READY';
    const ms = this.host.timings.battleCountdownMs;
    this.countdownEndsAt = this.now() + ms;
    this.countdownTimer.set(() => this.startBattle(), ms);
    this.dirty = true;
    this.emit({ type: 'phase', phase: 'READY' });
  }

  private startBattle(): void {
    this.run(() => {
      if (this.phase !== 'READY') return;
      this.phase = 'IN_BATTLE';
      this.countdownEndsAt = null;
      this.startedAt = this.now();
      this.moveNumber = 1;
      this.dirty = true;
      this.emit({ type: 'phase', phase: 'IN_BATTLE' });
      this.startTurn(this.host.fairCoin(), 'start');
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Battle (IN_BATTLE)
  // ---------------------------------------------------------------------------------------------

  /**
   * Resolves a human attack. Fully synchronous from validation to mutation, so two events racing for the
   * same move can never both pass validation.
   */
  attack(userId: string, coord: Coord, moveNumber: number): Result<AttackOutcome> {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      if (this.phase !== 'IN_BATTLE') {
        return fail('WRONG_PHASE', this.phase === 'FINISHED' ? 'The game is over.' : 'The battle has not started yet.');
      }
      if (this.turn !== idx) return fail('NOT_YOUR_TURN', 'It is not your turn.');
      if (moveNumber !== this.moveNumber) {
        return fail('STALE_MOVE', `Expected move number ${this.moveNumber}.`, { expected: this.moveNumber });
      }
      const target = this.players[otherIndex(idx)]?.board;
      if (!target) return fail('INTERNAL', 'Opponent board is missing.');
      if (!isInsideBoard(coord)) return fail('INVALID_PAYLOAD', 'Coordinate is outside the board.');
      if (hasBeenAttacked(target, coord)) return fail('CELL_ALREADY_ATTACKED', 'That cell was already attacked.');
      return ok(this.applyAttack(idx, coord));
    });
  }

  private applyAttack(idx: PlayerIndex, coord: Coord): AttackOutcome {
    const attacker = this.players[idx]!;
    const target = this.players[otherIndex(idx)]!.board!;
    const res = receiveAttack(target, coord);
    if (!res.ok) throw new Error(`receiveAttack rejected a validated shot: ${res.error}`);
    const moveNumber = this.moveNumber;
    const record: InternalShot = { moveNumber, attacker: idx, x: coord.x, y: coord.y, outcome: res.outcome, at: this.now() };
    let sunk: SunkShip | undefined;
    if (res.outcome === 'sunk' && res.ship) {
      record.sunk = res.ship.type;
      sunk = { type: res.ship.type, cells: res.ship.cells.map((c) => ({ ...c })) };
    }
    this.history.push(record);
    attacker.consecutiveTimeouts = 0;
    this.moveNumber += 1;
    this.dirty = true;
    this.emit(
      sunk
        ? { type: 'shot', attacker: idx, x: coord.x, y: coord.y, outcome: res.outcome, sunk, moveNumber }
        : { type: 'shot', attacker: idx, x: coord.x, y: coord.y, outcome: res.outcome, moveNumber },
    );
    if (res.allSunk) {
      this.finish('ALL_SUNK', idx);
      return { outcome: res.outcome, gameOver: true };
    }
    this.startTurn(otherIndex(idx), 'shot');
    return { outcome: res.outcome, gameOver: false };
  }

  private startTurn(idx: PlayerIndex, reason: 'shot' | 'timeout' | 'start'): void {
    const slot = this.players[idx]!;
    this.turn = idx;
    this.turnTimer.clear();
    this.aiTimer.clear();
    if (slot.isAi) {
      // The AI never times out; it answers after the configured thinking delay.
      this.turnDeadline = null;
      this.aiTimer.set(() => this.aiMove(), this.host.timings.aiMoveDelayMs);
    } else {
      const ms = this.host.timings.turnTimeoutMs;
      this.turnDeadline = this.now() + ms;
      this.turnTimer.set(() => this.onTurnTimeout(), ms);
    }
    this.dirty = true;
    this.emit({ type: 'turn', turn: idx, deadline: this.turnDeadline, reason });
  }

  private onTurnTimeout(): void {
    this.run(() => {
      if (this.phase !== 'IN_BATTLE' || this.turn === null) return;
      const idx = this.turn;
      const slot = this.players[idx];
      if (!slot) return;
      slot.consecutiveTimeouts += 1;
      if (slot.consecutiveTimeouts >= this.host.timings.maxConsecutiveTimeouts) {
        this.finish('TIMEOUT', otherIndex(idx));
        return;
      }
      this.startTurn(otherIndex(idx), 'timeout');
    });
  }

  private aiMove(): void {
    this.run(() => {
      if (this.phase !== 'IN_BATTLE' || this.turn === null) return;
      const idx = this.turn;
      const slot = this.players[idx];
      const human = this.players[otherIndex(idx)];
      if (!slot?.isAi || !slot.ai || !human?.board) return;
      // The AI only ever sees what a human opponent would see.
      const view = toEnemyBoardView(human.board);
      let coord: Coord | null = null;
      try {
        coord = slot.ai.chooseShot(view);
      } catch {
        coord = null;
      }
      if (!coord || !isInsideBoard(coord) || hasBeenAttacked(human.board, coord)) coord = this.fallbackShot(human.board);
      if (!coord) return;
      this.applyAttack(idx, coord);
    });
  }

  /** Defensive: picks any untried cell when the AI misbehaves, so a practice game can never stall. */
  private fallbackShot(board: BoardState): Coord | null {
    const candidates: Coord[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) if (!hasBeenAttacked(board, { x, y })) candidates.push({ x, y });
    }
    if (candidates.length === 0) return null;
    return candidates[Math.min(candidates.length - 1, Math.floor(this.host.rng() * candidates.length))] ?? null;
  }

  forfeit(userId: string): Result {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      if (this.phase !== 'IN_BATTLE') return fail('WRONG_PHASE', 'There is no active battle to forfeit.');
      this.finish('FORFEIT', otherIndex(idx));
      return ok(undefined);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Leaving, disconnects and removal
  // ---------------------------------------------------------------------------------------------

  /** Explicit leave: forfeits an active battle, otherwise behaves like an immediate grace expiry. */
  leave(userId: string): Result {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      this.dropPlayer(idx, 'left');
      return ok(undefined);
    });
  }

  /** Connection status of a human participant changed (user-level: at least one live socket or none). */
  setConnected(userId: string, connected: boolean): void {
    this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return;
      const slot = this.players[idx]!;
      if (slot.connected === connected) return;
      if (connected) {
        slot.connected = true;
        slot.reconnectTimer.clear();
        slot.reconnectDeadline = null;
        this.dirty = true;
        this.emit({ type: 'connection', player: idx, connected: true, reconnectDeadline: null });
      } else {
        this.startGrace(slot);
      }
    });
  }

  private startGrace(slot: PlayerSlot): void {
    const idx = this.seatOf(slot);
    if (idx === null) return;
    const ms = this.host.timings.reconnectGraceMs;
    slot.connected = false;
    slot.reconnectDeadline = this.now() + ms;
    // Bound to the slot object (not the index) because lobby seats can be re-ordered while a player is away.
    slot.reconnectTimer.set(() => this.onGraceExpired(slot), ms);
    if (this.phase === 'WAITING') {
      slot.ready = false;
      this.updateLobbyCountdown();
    }
    this.dirty = true;
    this.emit({ type: 'connection', player: idx, connected: false, reconnectDeadline: slot.reconnectDeadline });
  }

  private onGraceExpired(slot: PlayerSlot): void {
    this.run(() => {
      const idx = this.seatOf(slot);
      if (idx === null || slot.connected) return;
      slot.reconnectDeadline = null;
      this.dropPlayer(idx, 'disconnected');
    });
  }

  private dropPlayer(idx: PlayerIndex, cause: RemovalCause): void {
    if (!this.players[idx]) return;
    switch (this.phase) {
      case 'IN_BATTLE':
        this.finish(cause === 'left' ? 'FORFEIT' : 'ABANDONED', otherIndex(idx));
        this.detach(idx, cause);
        break;
      case 'WAITING':
        this.detach(idx, cause);
        this.collapseLobby(idx);
        break;
      case 'PLACING_SHIPS':
      case 'READY':
        this.detach(idx, cause);
        if (this.mode === 'PRIVATE') this.revertToWaiting(idx);
        else if (this.mode === 'QUICK') this.finish('CANCELLED', null);
        // PRACTICE: detach() already emptied the game (no human left) and it is deleted silently.
        break;
      case 'FINISHED':
        this.detach(idx, cause);
        break;
    }
  }

  /** Vacates a seat and notifies the host; deletes the game when no human is left. */
  private detach(idx: PlayerIndex, cause: RemovalCause): void {
    const slot = this.players[idx];
    if (!slot) return;
    slot.reconnectTimer.clear();
    slot.reconnectDeadline = null;
    this.players[idx] = null;
    this.dirty = true;
    const remaining = this.players[otherIndex(idx)];
    if (slot.userId) this.host.onPlayerRemoved(this, slot.userId, cause);
    if (remaining && !remaining.isAi) this.emit({ type: 'left', player: idx });
    if (this.humanCount() === 0) {
      this.players[otherIndex(idx)] = null;
      this.clearGameTimers();
      this.host.onEmpty(this);
    }
  }

  /** WAITING: the remaining player (if any) becomes host; ready flags and countdown reset. */
  private collapseLobby(removedIdx: PlayerIndex): void {
    const remaining = this.players[otherIndex(removedIdx)];
    if (!remaining) return;
    this.moveToHostSeat(remaining, removedIdx);
    remaining.ready = false;
    this.countdownEndsAt = null;
    this.countdownTimer.clear();
    this.dirty = true;
  }

  /** PRIVATE room lost a player before the battle: back to WAITING with the remaining player as host. */
  private revertToWaiting(removedIdx: PlayerIndex): void {
    const remaining = this.players[otherIndex(removedIdx)];
    if (!remaining) return;
    this.moveToHostSeat(remaining, removedIdx);
    this.phase = 'WAITING';
    this.placementTimer.clear();
    this.countdownTimer.clear();
    this.countdownEndsAt = null;
    remaining.board = null;
    remaining.ready = false;
    remaining.consecutiveTimeouts = 0;
    remaining.rematchRequested = false;
    this.dirty = true;
    this.emit({ type: 'phase', phase: 'WAITING' });
  }

  private moveToHostSeat(remaining: PlayerSlot, removedIdx: PlayerIndex): void {
    if (removedIdx === 0 && this.history.length === 0) {
      this.players[0] = remaining;
      this.players[1] = null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Finish, persistence feedback and rematch
  // ---------------------------------------------------------------------------------------------

  private finish(reason: EndReason, winner: PlayerIndex | null): void {
    if (this.phase === 'FINISHED') return;
    const now = this.now();
    this.phase = 'FINISHED';
    this.endedAt = now;
    this.turn = null;
    this.turnDeadline = null;
    this.countdownEndsAt = null;
    this.clearGameTimers();
    this.result = {
      winner,
      reason,
      durationMs: this.startedAt !== null ? Math.max(0, now - this.startedAt) : 0,
      participants: [summarize(this.players[0]), summarize(this.players[1])],
    };
    this.dirty = true;
    this.emit({ type: 'phase', phase: 'FINISHED' });
    this.emit({ type: 'finished', winner, reason });
    this.afterFlush.push(() => this.host.onFinished(this));
  }

  /** Writes rating changes / achievements from persistence into the seats and re-broadcasts. */
  applyOutcome(outcome: MatchRecordOutcome): void {
    this.run(() => {
      for (const p of outcome.participants) {
        const idx = this.indexOf(p.userId);
        if (idx === null) continue;
        const slot = this.players[idx]!;
        slot.ratingChange = this.mode === 'PRACTICE' ? null : p.ratingChange;
        slot.achievements = [...p.achievementsUnlocked];
        slot.rating = p.ratingAfter;
      }
      this.dirty = true;
    });
  }

  /** Forces a re-broadcast of the current state (e.g. after persistence failed). */
  touch(): void {
    this.run(() => {
      this.dirty = true;
    });
  }

  /**
   * Records a rematch vote. Returns `start: true` exactly once, when both seats agreed (the AI always
   * agrees); the manager then creates the follow-up game.
   */
  requestRematch(userId: string, accept: boolean): Result<{ start: boolean }> {
    return this.run(() => {
      const idx = this.indexOf(userId);
      if (idx === null) return notInGame();
      if (this.phase !== 'FINISHED') return fail('WRONG_PHASE', 'A rematch can only be requested after the game ended.');
      const opponent = this.players[otherIndex(idx)];
      if (!opponent) return fail('OPPONENT_LEFT', 'Your opponent has left; a rematch is no longer possible.');
      if (this.rematchPending) return ok({ start: false });
      const slot = this.players[idx]!;
      slot.rematchRequested = accept;
      this.dirty = true;
      if (!accept) return ok({ start: false });
      this.emit({ type: 'rematch_requested', player: idx });
      if (opponent.isAi || opponent.rematchRequested) {
        this.rematchPending = true;
        return ok({ start: true });
      }
      return ok({ start: false });
    });
  }

  /** Called by the manager when a rematch could not be created after all. */
  cancelRematch(): void {
    this.run(() => {
      if (!this.rematchPending) return;
      this.rematchPending = false;
      for (const [, slot] of this.seats()) slot.rematchRequested = false;
      this.dirty = true;
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private createSlot(init: PlayerInit): PlayerSlot {
    const base = {
      connected: true,
      ready: false,
      board: null,
      consecutiveTimeouts: 0,
      reconnectDeadline: null,
      reconnectTimer: new TimerSlot(this.host.clock),
      rematchRequested: false,
      ratingChange: null,
      achievements: null,
    };
    if (init.kind === 'ai') {
      const profile = AI_PROFILES[init.difficulty];
      return {
        ...base,
        userId: null,
        isAi: true,
        aiDifficulty: init.difficulty,
        ai: createAi(init.difficulty, { rng: this.host.rng }),
        displayName: profile.displayName,
        avatar: profile.avatar,
        isGuest: false,
        rating: profile.rating,
      };
    }
    return {
      ...base,
      connected: init.connected,
      userId: init.profile.userId,
      isAi: false,
      aiDifficulty: null,
      ai: null,
      displayName: init.profile.displayName,
      avatar: init.profile.avatar,
      isGuest: init.profile.isGuest,
      rating: init.profile.rating,
    };
  }

  private seatOf(slot: PlayerSlot): PlayerIndex | null {
    if (this.players[0] === slot) return 0;
    if (this.players[1] === slot) return 1;
    return null;
  }

  private clearGameTimers(): void {
    this.countdownTimer.clear();
    this.turnTimer.clear();
    this.placementTimer.clear();
    this.aiTimer.clear();
  }

  private emit(event: SessionEvent): void {
    if (this.pending) this.pending.push(event);
  }

  /**
   * Runs `fn` as one state transition: nested calls join the outer transaction; the outermost call
   * flushes exactly one `onChange` (when something changed and a human is still seated) and then runs
   * the deferred hooks (persistence).
   */
  private run<T>(fn: () => T): T {
    if (this.pending) return fn();
    this.pending = [];
    this.dirty = false;
    try {
      return fn();
    } finally {
      const events = this.pending;
      const hooks = this.afterFlush;
      this.pending = null;
      this.afterFlush = [];
      if ((this.dirty || events.length > 0) && !this.disposed && this.humanCount() > 0) this.host.onChange(this, events);
      for (const hook of hooks) hook();
    }
  }
}

function summarize(slot: PlayerSlot | null): FinishedParticipant | null {
  if (!slot) return null;
  return {
    userId: slot.userId,
    isAi: slot.isAi,
    aiDifficulty: slot.aiDifficulty,
    displayName: slot.displayName,
    avatar: slot.avatar,
  };
}

function notInGame(): Failure {
  return fail('NOT_IN_GAME', 'You are not a participant of this game.');
}
