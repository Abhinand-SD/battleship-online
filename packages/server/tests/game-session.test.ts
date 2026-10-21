import { coordKey, type GamePhase, type GameSnapshot } from '@battleship/shared';
import { describe, expect, it } from 'vitest';
import {
  GameSession,
  type GameSessionInit,
  type PlayerIndex,
  type RemovalCause,
  type SessionEvent,
  type SessionHost,
} from '../src/game/GameSession';
import { buildSnapshot } from '../src/game/snapshot';
import { createManualClock, type ManualClock } from '../src/game/timers';
import type { GameTimings, PlayerProfile } from '../src/game/types';
import { FLEET_BOTTOM, FLEET_TOP, cellKeys, cellsOf, missesAgainst, seededRng } from './helpers/fleets';

const TIMINGS: GameTimings = {
  lobbyCountdownMs: 3_000,
  battleCountdownMs: 3_000,
  turnTimeoutMs: 45_000,
  maxConsecutiveTimeouts: 3,
  reconnectGraceMs: 60_000,
  placementTimeoutMs: 180_000,
  aiMoveDelayMs: 900,
};

const alice: PlayerProfile = { userId: 'alice', displayName: 'Alice', avatar: 'anchor', isGuest: false, rating: 1000 };
const bob: PlayerProfile = { userId: 'bob', displayName: 'Bob', avatar: 'compass', isGuest: true, rating: 1050 };

interface Harness {
  clock: ManualClock;
  host: SessionHost;
  changes: Array<{ phase: GamePhase; events: SessionEvent[] }>;
  finished: GameSession[];
  removed: Array<{ userId: string; cause: RemovalCause }>;
  emptied: GameSession[];
  events(): SessionEvent[];
  lastEvents(): SessionEvent[];
}

function createHarness(opts: { fairCoin?: () => PlayerIndex; rng?: () => number; timings?: Partial<GameTimings> } = {}): Harness {
  const clock = createManualClock();
  const changes: Harness['changes'] = [];
  const finished: GameSession[] = [];
  const removed: Harness['removed'] = [];
  const emptied: GameSession[] = [];
  const host: SessionHost = {
    clock,
    timings: { ...TIMINGS, ...opts.timings },
    rng: opts.rng ?? seededRng(42),
    fairCoin: opts.fairCoin ?? (() => 0),
    onChange: (s, events) => changes.push({ phase: s.phase, events: [...events] }),
    onFinished: (s) => finished.push(s),
    onPlayerRemoved: (_s, userId, cause) => removed.push({ userId, cause }),
    onEmpty: (s) => {
      emptied.push(s);
      s.dispose();
    },
  };
  return {
    clock,
    host,
    changes,
    finished,
    removed,
    emptied,
    events: () => changes.flatMap((c) => c.events),
    lastEvents: () => changes[changes.length - 1]?.events ?? [],
  };
}

function quickGame(h: Harness, init: Partial<GameSessionInit> = {}): GameSession {
  const session = new GameSession(h.host, {
    mode: 'QUICK',
    roomCode: null,
    players: [
      { kind: 'human', profile: alice, connected: true },
      { kind: 'human', profile: bob, connected: true },
    ],
    initialPhase: 'PLACING_SHIPS',
    ...init,
  });
  session.begin();
  return session;
}

function privateRoom(h: Harness): GameSession {
  const session = new GameSession(h.host, {
    mode: 'PRIVATE',
    roomCode: 'ABCDEF',
    players: [{ kind: 'human', profile: alice, connected: true }, null],
    initialPhase: 'WAITING',
  });
  session.begin();
  return session;
}

/** Confirms both fleets and runs the battle countdown. Alice = seat 0 (FLEET_TOP), Bob = seat 1 (FLEET_BOTTOM). */
function toBattle(h: Harness, session: GameSession): void {
  expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);
  expect(session.confirmFleet('bob', FLEET_BOTTOM).ok).toBe(true);
  expect(session.phase).toBe('READY');
  h.clock.advance(TIMINGS.battleCountdownMs);
  expect(session.phase).toBe('IN_BATTLE');
}

function battle(h: Harness): GameSession {
  const session = quickGame(h);
  toBattle(h, session);
  return session;
}

function expectError(result: { ok: boolean; error?: { code: string } }, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error?.code).toBe(code);
}

/** Bob's "safe" misses: cells that hit neither fleet, so coordinates of ships only ever appear as real shots. */
const bottomKeys = cellKeys(FLEET_BOTTOM);
const topKeys = cellKeys(FLEET_TOP);
const bobMisses = missesAgainst(FLEET_TOP).filter((c) => !bottomKeys.has(coordKey(c)));
const aliceTargets = cellsOf(FLEET_BOTTOM);

/** Asserts that `snap` leaks nothing about the enemy fleet beyond what the viewer has legitimately discovered. */
function assertEnemyFleetHidden(snap: GameSnapshot, enemyCells: Array<{ x: number; y: number }>): void {
  // My own board and the opponent's entries in the history legitimately contain the opponent's shots,
  // whose coordinates may coincide with the opponent's own ship cells. The leak check therefore looks at
  // everything else: enemyBoard, my own history entries, players, result...
  const { myBoard, history, ...rest } = snap;
  const json = JSON.stringify({ ...rest, history: history.filter((r) => r.by === 'me') });
  expect(JSON.stringify(myBoard).match(/"fleet"/g)?.length ?? 0).toBe(1);
  // The only `fleet` array in a snapshot is the viewer's own board.
  expect(json.match(/"fleet"/g)?.length ?? 0).toBe(0);
  expect((snap.enemyBoard as unknown as Record<string, unknown>)['fleet']).toBeUndefined();
  expect((snap.opponent as unknown as Record<string, unknown> | null)?.['fleet']).toBeUndefined();
  const shot = new Set(snap.enemyBoard.shots.map(coordKey));
  const sunkCells = new Set(snap.enemyBoard.sunkShips.flatMap((s) => s.cells.map(coordKey)));
  for (const key of sunkCells) expect(shot.has(key)).toBe(true);
  for (const c of enemyCells) {
    if (shot.has(coordKey(c))) continue;
    expect(json).not.toContain(`"x":${c.x},"y":${c.y}`);
  }
}

describe('GameSession', () => {
  it('runs the full happy path through all phases and records exactly 17 hits', () => {
    const h = createHarness();
    const session = privateRoom(h);
    expect(session.phase).toBe('WAITING');
    expect(h.lastEvents()).toEqual([{ type: 'phase', phase: 'WAITING' }]);

    const joined = session.join(bob, true);
    expect(joined.ok).toBe(true);
    expect(h.lastEvents()).toEqual([{ type: 'joined', player: 1 }]);

    expect(session.setReady('alice', true).ok).toBe(true);
    expect(session.countdownEndsAt).toBeNull();
    expect(session.setReady('bob', true).ok).toBe(true);
    expect(session.countdownEndsAt).toBe(h.clock.now() + TIMINGS.lobbyCountdownMs);

    h.clock.advance(TIMINGS.lobbyCountdownMs - 1);
    expect(session.phase).toBe('WAITING');
    h.clock.advance(1);
    expect(session.phase).toBe('PLACING_SHIPS');
    expect(h.lastEvents()).toEqual([{ type: 'phase', phase: 'PLACING_SHIPS' }]);

    expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);
    expect(session.phase).toBe('PLACING_SHIPS');
    expect(session.confirmFleet('bob', FLEET_BOTTOM).ok).toBe(true);
    expect(session.phase).toBe('READY');
    expect(session.countdownEndsAt).toBe(h.clock.now() + TIMINGS.battleCountdownMs);

    h.clock.advance(TIMINGS.battleCountdownMs);
    expect(session.phase).toBe('IN_BATTLE');
    expect(session.turn).toBe(0);
    expect(session.moveNumber).toBe(1);
    expect(session.startedAt).toBe(h.clock.now());
    expect(session.turnDeadline).toBe(h.clock.now() + TIMINGS.turnTimeoutMs);
    expect(h.lastEvents()).toEqual([
      { type: 'phase', phase: 'IN_BATTLE' },
      { type: 'turn', turn: 0, deadline: h.clock.now() + TIMINGS.turnTimeoutMs, reason: 'start' },
    ]);

    let move = 1;
    for (let i = 0; i < 17; i++) {
      const target = aliceTargets[i]!;
      const res = session.attack('alice', target, move++);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error('unreachable');
      expect(res.value.outcome).not.toBe('miss');
      if (i < 16) {
        expect(res.value.gameOver).toBe(false);
        expect(session.turn).toBe(1);
        const miss = session.attack('bob', bobMisses[i]!, move++);
        expect(miss.ok && miss.value.outcome === 'miss').toBe(true);
        expect(session.turn).toBe(0);
      } else {
        expect(res.value.outcome).toBe('sunk');
        expect(res.value.gameOver).toBe(true);
      }
    }

    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: 0, reason: 'ALL_SUNK', durationMs: 0 });
    expect(session.history).toHaveLength(33);
    expect(session.endedAt).toBe(h.clock.now());
    expect(h.finished).toEqual([session]);
    expect(h.lastEvents().map((e) => e.type)).toEqual(['shot', 'phase', 'finished']);

    const snapA = buildSnapshot(session, 'alice');
    expect(snapA.result).toMatchObject({ winner: 'me', reason: 'ALL_SUNK' });
    expect(snapA.result?.stats.me).toEqual({ shots: 17, hits: 17, misses: 0, accuracy: 100, shipsSunk: 5, shipsLost: 0 });
    expect(snapA.result?.stats.opponent).toEqual({ shots: 16, hits: 0, misses: 16, accuracy: 0, shipsSunk: 0, shipsLost: 5 });
    expect(snapA.enemyBoard.remaining).toEqual([]);
    expect(snapA.enemyBoard.sunkShips).toHaveLength(5);
    expect(snapA.rematch).toEqual({ requestedByMe: false, requestedByOpponent: false });

    const snapB = buildSnapshot(session, 'bob');
    expect(snapB.result).toMatchObject({ winner: 'opponent', reason: 'ALL_SUNK' });
    expect(snapB.myBoard.sunk).toHaveLength(5);
    expect(snapB.history.filter((s) => s.by === 'opponent')).toHaveLength(17);
    // Nothing is left ticking.
    expect(h.clock.pending()).toBe(0);
  });

  it('enforces turn order', () => {
    const h = createHarness();
    const session = battle(h);
    expectError(session.attack('bob', { x: 0, y: 0 }, 1), 'NOT_YOUR_TURN');
    expect(session.attack('alice', { x: 0, y: 0 }, 1).ok).toBe(true);
    expectError(session.attack('alice', { x: 1, y: 0 }, 2), 'NOT_YOUR_TURN');
    expectError(session.attack('carol', { x: 1, y: 0 }, 2), 'NOT_IN_GAME');
  });

  it('rejects stale / duplicated move numbers without side effects', () => {
    const h = createHarness();
    const session = battle(h);
    expect(session.attack('alice', { x: 9, y: 9 }, 1).ok).toBe(true);
    expectError(session.attack('bob', { x: 0, y: 9 }, 1), 'STALE_MOVE');
    expectError(session.attack('bob', { x: 0, y: 9 }, 3), 'STALE_MOVE');
    expect(session.attack('bob', { x: 0, y: 9 }, 2).ok).toBe(true);
    // Alice's turn again (move 3): a replay of her first event is rejected and changes nothing.
    const before = { history: session.history.length, moveNumber: session.moveNumber, changes: h.changes.length };
    expectError(session.attack('alice', { x: 9, y: 9 }, 1), 'STALE_MOVE');
    expect(session.history).toHaveLength(before.history);
    expect(session.moveNumber).toBe(before.moveNumber);
    expect(h.changes).toHaveLength(before.changes);
    expect(session.turn).toBe(0);
  });

  it('rejects attacking the same cell twice', () => {
    const h = createHarness();
    const session = battle(h);
    expect(session.attack('alice', { x: 5, y: 5 }, 1).ok).toBe(true);
    expect(session.attack('bob', { x: 9, y: 0 }, 2).ok).toBe(true);
    expectError(session.attack('alice', { x: 5, y: 5 }, 3), 'CELL_ALREADY_ATTACKED');
    expect(session.history).toHaveLength(2);
    expectError(session.attack('alice', { x: 10, y: 0 }, 3), 'INVALID_PAYLOAD');
  });

  it('rejects attacks before the battle starts', () => {
    const h = createHarness();
    const session = quickGame(h);
    expectError(session.attack('alice', { x: 0, y: 0 }, 1), 'WRONG_PHASE');
    session.confirmFleet('alice', FLEET_TOP);
    session.confirmFleet('bob', FLEET_BOTTOM);
    expect(session.phase).toBe('READY');
    expectError(session.attack('alice', { x: 0, y: 0 }, 1), 'WRONG_PHASE');
    expectError(session.forfeit('alice'), 'WRONG_PHASE');
    expectError(session.setReady('alice', true), 'WRONG_PHASE');
  });

  it('validates and locks fleets', () => {
    const h = createHarness();
    const session = quickGame(h);
    const overlapping = FLEET_TOP.map((s) => ({ ...s, y: 0 }));
    const invalid = session.confirmFleet('alice', overlapping);
    expectError(invalid, 'INVALID_FLEET');
    if (!invalid.ok) expect(invalid.error.message).toMatch(/overlaps/);
    expectError(session.confirmFleet('alice', FLEET_TOP.slice(1)), 'INVALID_FLEET');
    expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);
    expectError(session.confirmFleet('alice', FLEET_TOP), 'FLEET_LOCKED');
    expect(buildSnapshot(session, 'alice').me.fleetConfirmed).toBe(true);
    expect(buildSnapshot(session, 'bob').opponent?.fleetConfirmed).toBe(true);
    expect(buildSnapshot(session, 'bob').myBoard.fleet).toEqual([]);
  });

  it('detects the win only on the 17th hit', () => {
    const h = createHarness();
    const session = battle(h);
    let move = 1;
    for (let i = 0; i < 16; i++) {
      const res = session.attack('alice', aliceTargets[i]!, move++);
      expect(res.ok && !res.value.gameOver).toBe(true);
      expect(session.attack('bob', bobMisses[i]!, move++).ok).toBe(true);
    }
    expect(session.phase).toBe('IN_BATTLE');
    expect(buildSnapshot(session, 'alice').enemyBoard.remaining).toEqual(['destroyer']);
    const last = session.attack('alice', aliceTargets[16]!, move);
    expect(last.ok && last.value.gameOver && last.value.outcome === 'sunk').toBe(true);
    expect(session.result?.winner).toBe(0);
    expect(session.history.filter((s) => s.attacker === 0 && s.outcome !== 'miss')).toHaveLength(17);
  });

  it('handles forfeit', () => {
    const h = createHarness();
    const session = battle(h);
    expect(session.attack('alice', { x: 0, y: 0 }, 1).ok).toBe(true);
    expect(session.forfeit('bob').ok).toBe(true);
    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: 0, reason: 'FORFEIT' });
    expect(h.lastEvents()).toEqual([
      { type: 'phase', phase: 'FINISHED' },
      { type: 'finished', winner: 0, reason: 'FORFEIT' },
    ]);
    expect(buildSnapshot(session, 'bob').result?.winner).toBe('opponent');
    expectError(session.attack('alice', { x: 1, y: 0 }, 2), 'WRONG_PHASE');
    expect(h.clock.pending()).toBe(0);
    // Both players are still seated: a rematch is possible.
    expect(buildSnapshot(session, 'alice').rematch).not.toBeNull();
  });

  it('skips turns on timeout and forfeits after the maximum number of consecutive timeouts', () => {
    const h = createHarness();
    const session = battle(h);
    const deadline = session.turnDeadline!;
    h.clock.advance(TIMINGS.turnTimeoutMs);
    expect(h.clock.now()).toBe(deadline);
    expect(session.turn).toBe(1);
    expect(session.moveNumber).toBe(1);
    expect(session.players[0]?.consecutiveTimeouts).toBe(1);
    expect(h.lastEvents()).toEqual([{ type: 'turn', turn: 1, deadline: h.clock.now() + TIMINGS.turnTimeoutMs, reason: 'timeout' }]);

    // Bob times out too, then Alice again (2), then Bob shoots, then Alice's third timeout ends it.
    h.clock.advance(TIMINGS.turnTimeoutMs);
    expect(session.turn).toBe(0);
    h.clock.advance(TIMINGS.turnTimeoutMs);
    expect(session.turn).toBe(1);
    expect(session.players[0]?.consecutiveTimeouts).toBe(2);
    expect(session.attack('bob', { x: 9, y: 9 }, 1).ok).toBe(true);
    // Bob's successful shot reset his own counter.
    expect(session.players[1]?.consecutiveTimeouts).toBe(0);
    expect(session.turn).toBe(0);
    h.clock.advance(TIMINGS.turnTimeoutMs);
    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: 1, reason: 'TIMEOUT' });
    expect(h.clock.pending()).toBe(0);
  });

  it('a successful shot resets the consecutive timeout counter', () => {
    const h = createHarness();
    const session = battle(h);
    h.clock.advance(TIMINGS.turnTimeoutMs); // alice 1
    h.clock.advance(TIMINGS.turnTimeoutMs); // bob 1
    h.clock.advance(TIMINGS.turnTimeoutMs); // alice 2
    expect(session.attack('bob', { x: 9, y: 9 }, 1).ok).toBe(true);
    expect(session.attack('alice', { x: 0, y: 9 }, 2).ok).toBe(true);
    expect(session.players[0]?.consecutiveTimeouts).toBe(0);
    expect(session.players[1]?.consecutiveTimeouts).toBe(0);
    // Both counters were reset by the successful shots, so bob needs three fresh timeouts in a row.
    h.clock.advance(TIMINGS.turnTimeoutMs); // bob 1
    h.clock.advance(TIMINGS.turnTimeoutMs); // alice 1
    h.clock.advance(TIMINGS.turnTimeoutMs); // bob 2
    expect(session.result).toBeNull();
    h.clock.advance(TIMINGS.turnTimeoutMs); // alice 2
    h.clock.advance(TIMINGS.turnTimeoutMs); // bob 3 -> game over, alice wins
    expect(session.result).toMatchObject({ winner: 0, reason: 'TIMEOUT' });
  });

  it('ends an active battle as ABANDONED when the reconnect grace expires', () => {
    const h = createHarness();
    const session = battle(h);
    session.setConnected('bob', false);
    const deadline = h.clock.now() + TIMINGS.reconnectGraceMs;
    expect(session.players[1]).toMatchObject({ connected: false, reconnectDeadline: deadline });
    expect(h.lastEvents()).toEqual([{ type: 'connection', player: 1, connected: false, reconnectDeadline: deadline }]);
    expect(buildSnapshot(session, 'alice').opponentReconnectDeadline).toBe(deadline);
    expect(buildSnapshot(session, 'alice').opponent?.connected).toBe(false);

    // The battle keeps going meanwhile (alice can shoot, timeouts still apply).
    expect(session.attack('alice', { x: 5, y: 5 }, 1).ok).toBe(true);

    h.clock.advance(TIMINGS.reconnectGraceMs - 1);
    expect(session.phase).toBe('IN_BATTLE');
    h.clock.advance(1);
    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: 0, reason: 'ABANDONED' });
    expect(h.removed).toEqual([{ userId: 'bob', cause: 'disconnected' }]);
    expect(session.players[1]).toBeNull();
    const snap = buildSnapshot(session, 'alice');
    expect(snap.opponent).toBeNull();
    expect(snap.result?.winner).toBe('me');
    expect(snap.rematch).toBeNull();
    expectError(session.requestRematch('alice', true), 'OPPONENT_LEFT');
    expect(h.clock.pending()).toBe(0);
  });

  it('cancels the grace timer when the player reconnects in time', () => {
    const h = createHarness();
    const session = battle(h);
    session.setConnected('bob', false);
    h.clock.advance(TIMINGS.reconnectGraceMs / 2);
    session.setConnected('bob', true);
    expect(h.lastEvents()).toEqual([{ type: 'connection', player: 1, connected: true, reconnectDeadline: null }]);
    expect(session.players[1]?.reconnectDeadline).toBeNull();
    h.clock.advance(TIMINGS.reconnectGraceMs);
    expect(session.phase).toBe('IN_BATTLE');
    expect(session.players[1]?.connected).toBe(true);
  });

  it('cancels the game when placement times out', () => {
    const h = createHarness();
    const session = quickGame(h);
    expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);
    h.clock.advance(TIMINGS.placementTimeoutMs - 1);
    expect(session.phase).toBe('PLACING_SHIPS');
    h.clock.advance(1);
    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: null, reason: 'CANCELLED', durationMs: 0 });
    expect(h.lastEvents()).toEqual([
      { type: 'phase', phase: 'FINISHED' },
      { type: 'finished', winner: null, reason: 'CANCELLED' },
    ]);
    expect(buildSnapshot(session, 'bob').result).toMatchObject({ winner: null, reason: 'CANCELLED' });
    expect(h.clock.pending()).toBe(0);
  });

  it('collects rematch votes and reports when both agreed', () => {
    const h = createHarness();
    const session = battle(h);
    expectError(session.requestRematch('alice', true), 'WRONG_PHASE');
    session.forfeit('alice');
    const first = session.requestRematch('alice', true);
    expect(first).toEqual({ ok: true, value: { start: false } });
    expect(h.lastEvents()).toEqual([{ type: 'rematch_requested', player: 0 }]);
    expect(buildSnapshot(session, 'bob').rematch).toEqual({ requestedByMe: false, requestedByOpponent: true });

    // Withdrawing clears the vote.
    expect(session.requestRematch('alice', false)).toEqual({ ok: true, value: { start: false } });
    expect(buildSnapshot(session, 'bob').rematch?.requestedByOpponent).toBe(false);

    session.requestRematch('alice', true);
    const second = session.requestRematch('bob', true);
    expect(second).toEqual({ ok: true, value: { start: true } });
    expect(session.rematchPending).toBe(true);
    // Further votes do not trigger a second start.
    expect(session.requestRematch('bob', true)).toEqual({ ok: true, value: { start: false } });
  });

  it('reverts a private room to WAITING when a player leaves during placement', () => {
    const h = createHarness();
    const session = privateRoom(h);
    session.join(bob, true);
    session.setReady('alice', true);
    session.setReady('bob', true);
    h.clock.advance(TIMINGS.lobbyCountdownMs);
    expect(session.phase).toBe('PLACING_SHIPS');
    expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);

    expect(session.leave('bob').ok).toBe(true);
    expect(session.phase).toBe('WAITING');
    expect(session.players[0]?.userId).toBe('alice');
    expect(session.players[1]).toBeNull();
    expect(session.players[0]).toMatchObject({ board: null, ready: false });
    expect(h.lastEvents()).toEqual([
      { type: 'left', player: 1 },
      { type: 'phase', phase: 'WAITING' },
    ]);
    expect(h.removed).toEqual([{ userId: 'bob', cause: 'left' }]);
    const snap = buildSnapshot(session, 'alice');
    expect(snap).toMatchObject({ phase: 'WAITING', opponent: null, roomCode: 'ABCDEF' });
    expect(snap.myBoard.fleet).toEqual([]);
    expect(h.clock.pending()).toBe(0);

    // A new guest can join and the room works again.
    expect(session.join(bob, true).ok).toBe(true);
    expect(session.phase).toBe('WAITING');
  });

  it('promotes the guest to host when the host leaves a private room before the battle', () => {
    const h = createHarness();
    const session = privateRoom(h);
    session.join(bob, true);
    session.setReady('alice', true);
    session.setReady('bob', true);
    h.clock.advance(TIMINGS.lobbyCountdownMs);
    expect(session.leave('alice').ok).toBe(true);
    expect(session.phase).toBe('WAITING');
    expect(session.players[0]?.userId).toBe('bob');
    expect(session.players[1]).toBeNull();
    expect(buildSnapshot(session, 'bob').me.id).toBe('bob');
  });

  it('un-readying during the lobby countdown cancels it, and disconnecting resets ready', () => {
    const h = createHarness();
    const session = privateRoom(h);
    session.join(bob, true);
    session.setReady('alice', true);
    session.setReady('bob', true);
    expect(session.countdownEndsAt).not.toBeNull();
    session.setReady('bob', false);
    expect(session.countdownEndsAt).toBeNull();
    h.clock.advance(TIMINGS.lobbyCountdownMs);
    expect(session.phase).toBe('WAITING');

    session.setReady('bob', true);
    expect(session.countdownEndsAt).not.toBeNull();
    session.setConnected('bob', false);
    expect(session.players[1]?.ready).toBe(false);
    expect(session.countdownEndsAt).toBeNull();
    h.clock.advance(TIMINGS.lobbyCountdownMs);
    expect(session.phase).toBe('WAITING');
  });

  it('removes a player from a WAITING room after the grace period and deletes an empty room', () => {
    const h = createHarness();
    const session = privateRoom(h);
    session.join(bob, true);
    session.setConnected('alice', false);
    h.clock.advance(TIMINGS.reconnectGraceMs);
    expect(session.players[0]?.userId).toBe('bob');
    expect(session.players[1]).toBeNull();
    expect(h.removed).toEqual([{ userId: 'alice', cause: 'disconnected' }]);
    expect(h.emptied).toEqual([]);

    session.setConnected('bob', false);
    h.clock.advance(TIMINGS.reconnectGraceMs);
    expect(h.emptied).toEqual([session]);
    expect(session.players).toEqual([null, null]);
    expect(h.clock.pending()).toBe(0);
  });

  it('treats leaving an active battle as a forfeit and vacates the seat', () => {
    const h = createHarness();
    const session = battle(h);
    expect(session.leave('alice').ok).toBe(true);
    expect(session.result).toMatchObject({ winner: 1, reason: 'FORFEIT' });
    expect(session.players[0]).toBeNull();
    expect(h.removed).toEqual([{ userId: 'alice', cause: 'left' }]);
    const snap = buildSnapshot(session, 'bob');
    expect(snap.opponent).toBeNull();
    expect(snap.result?.winner).toBe('me');
    // History is still consistent for the remaining seat.
    expect(h.finished).toHaveLength(1);
    expect(session.result?.participants[0]?.userId).toBe('alice');
  });

  it('cancels a quick match when a player leaves during placement', () => {
    const h = createHarness();
    const session = quickGame(h);
    expect(session.leave('bob').ok).toBe(true);
    expect(session.phase).toBe('FINISHED');
    expect(session.result).toMatchObject({ winner: null, reason: 'CANCELLED' });
    expect(session.players[1]).toBeNull();
    expect(h.lastEvents().map((e) => e.type)).toEqual(['left', 'phase', 'finished']);
    expect(buildSnapshot(session, 'alice').result?.reason).toBe('CANCELLED');
  });

  it('deletes a practice game silently when the human leaves before the battle', () => {
    const h = createHarness();
    const session = new GameSession(h.host, {
      mode: 'PRACTICE',
      roomCode: null,
      players: [
        { kind: 'human', profile: alice, connected: true },
        { kind: 'ai', difficulty: 'easy' },
      ],
      initialPhase: 'PLACING_SHIPS',
    });
    session.begin();
    expect(session.players[1]?.board).not.toBeNull();
    expect(session.leave('alice').ok).toBe(true);
    expect(h.emptied).toEqual([session]);
    expect(h.finished).toEqual([]);
    expect(h.clock.pending()).toBe(0);
  });

  it('plays a practice game: the AI confirms immediately, moves on its own and never times out', () => {
    const h = createHarness({ fairCoin: () => 1 });
    const session = new GameSession(h.host, {
      mode: 'PRACTICE',
      roomCode: null,
      players: [
        { kind: 'human', profile: alice, connected: true },
        { kind: 'ai', difficulty: 'hard' },
      ],
      initialPhase: 'PLACING_SHIPS',
    });
    session.begin();
    const aiBoard = session.players[1]!.board!;
    const snap0 = buildSnapshot(session, 'alice');
    expect(snap0.opponent).toMatchObject({ isAi: true, aiDifficulty: 'hard', fleetConfirmed: true, connected: true });
    assertEnemyFleetHidden(snap0, cellsOf(aiBoard.fleet));

    expect(session.confirmFleet('alice', FLEET_TOP).ok).toBe(true);
    h.clock.advance(TIMINGS.battleCountdownMs);
    expect(session.phase).toBe('IN_BATTLE');
    expect(session.turn).toBe(1);
    expect(session.turnDeadline).toBeNull();
    expect(buildSnapshot(session, 'alice').turn).toBe('opponent');

    h.clock.advance(TIMINGS.aiMoveDelayMs - 1);
    expect(session.history).toHaveLength(0);
    h.clock.advance(1);
    expect(session.history).toHaveLength(1);
    expect(session.history[0]?.attacker).toBe(1);
    expect(session.turn).toBe(0);

    const targets = cellsOf(aiBoard.fleet);
    let i = 0;
    while (session.phase === 'IN_BATTLE') {
      expect(session.turn).toBe(0);
      const res = session.attack('alice', targets[i++]!, session.moveNumber);
      expect(res.ok).toBe(true);
      assertEnemyFleetHidden(buildSnapshot(session, 'alice'), targets);
      if (session.phase === 'IN_BATTLE') {
        expect(session.turn).toBe(1);
        h.clock.advance(TIMINGS.aiMoveDelayMs);
      }
    }
    expect(i).toBe(17);
    expect(session.result).toMatchObject({ winner: 0, reason: 'ALL_SUNK' });
    const aiShots = session.history.filter((s) => s.attacker === 1);
    expect(aiShots.length).toBeGreaterThanOrEqual(16);
    // The AI never fires at the same cell twice.
    expect(new Set(aiShots.map(coordKey)).size).toBe(aiShots.length);
    expect(h.clock.pending()).toBe(0);
  });

  it('never leaks the enemy fleet in snapshots or events', () => {
    const h = createHarness();
    const session = battle(h);
    const bottomCells = cellsOf(FLEET_BOTTOM);
    const topCells = cellsOf(FLEET_TOP);
    const check = (): void => {
      assertEnemyFleetHidden(buildSnapshot(session, 'alice'), bottomCells);
      assertEnemyFleetHidden(buildSnapshot(session, 'bob'), topCells);
    };
    check();
    let move = 1;
    for (let i = 0; i < 17; i++) {
      expect(session.attack('alice', aliceTargets[i]!, move++).ok).toBe(true);
      check();
      if (session.phase !== 'IN_BATTLE') break;
      expect(session.attack('bob', bobMisses[i]!, move++).ok).toBe(true);
      check();
    }
    expect(session.phase).toBe('FINISHED');
    // Shot events only ever reveal cells once they were fired at; sunk ships only once fully hit.
    const shots = h.events().filter((e): e is Extract<SessionEvent, { type: 'shot' }> => e.type === 'shot');
    const firedByAlice = new Set<string>();
    for (const shot of shots) {
      if (shot.attacker !== 0) continue;
      firedByAlice.add(coordKey(shot));
      if (shot.sunk) for (const c of shot.sunk.cells) expect(firedByAlice.has(coordKey(c))).toBe(true);
    }
    // Bob's snapshot: alice's unsunk ships never appear, even though bob has lost everything.
    const snapB = buildSnapshot(session, 'bob');
    for (const c of topCells) expect(JSON.stringify(snapB.enemyBoard)).not.toContain(`"x":${c.x},"y":${c.y}`);
    expect(topKeys.size).toBe(17);
  });
});
