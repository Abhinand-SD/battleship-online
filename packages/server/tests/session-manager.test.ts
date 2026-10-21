import { ROOM_CODE_ALPHABET, type GamePhase } from '@battleship/shared';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { GameSession, PlayerIndex, RemovalCause, SessionEvent } from '../src/game/GameSession';
import { SessionManager } from '../src/game/SessionManager';
import { buildSnapshot } from '../src/game/snapshot';
import { createManualClock, type ManualClock } from '../src/game/timers';
import type { GameTimings, PlayerProfile } from '../src/game/types';
import { createFakeRepos, type FakeRepositories } from './helpers/fakeRepos';
import { FLEET_BOTTOM, FLEET_TOP, cellsOf, seededRng } from './helpers/fleets';

const TIMINGS: GameTimings = {
  lobbyCountdownMs: 3_000,
  battleCountdownMs: 3_000,
  turnTimeoutMs: 45_000,
  maxConsecutiveTimeouts: 3,
  reconnectGraceMs: 60_000,
  placementTimeoutMs: 180_000,
  aiMoveDelayMs: 900,
};

interface Rig {
  clock: ManualClock;
  repos: FakeRepositories;
  manager: SessionManager;
  changed: Array<{ gameId: string; phase: GamePhase; events: SessionEvent[] }>;
  closed: Array<{ userId: string; gameId: string; reason: RemovalCause }>;
  online: Set<string>;
  profile(userId: string): Promise<PlayerProfile>;
}

function createRig(opts: { fairCoin?: () => PlayerIndex; timings?: Partial<GameTimings> } = {}): Rig {
  const clock = createManualClock();
  const repos = createFakeRepos();
  for (const [id, name] of [
    ['alice', 'Alice'],
    ['bob', 'Bob'],
    ['carol', 'Carol'],
  ] as const) {
    repos.addUser({ id, displayName: name });
  }
  const changed: Rig['changed'] = [];
  const closed: Rig['closed'] = [];
  const online = new Set(['alice', 'bob', 'carol']);
  const manager = new SessionManager({
    timings: { ...TIMINGS, ...opts.timings },
    logger: pino({ level: 'silent' }),
    repos,
    clock,
    rng: seededRng(7),
    fairCoin: opts.fairCoin ?? (() => 0),
    isOnline: (userId) => online.has(userId),
    notifier: {
      gameChanged: (session, events) => changed.push({ gameId: session.id, phase: session.phase, events: [...events] }),
      gameClosed: (userId, gameId, reason) => closed.push({ userId, gameId, reason }),
    },
  });
  const profile = async (userId: string): Promise<PlayerProfile> => {
    const p = await manager.loadProfile(userId);
    if (!p) throw new Error(`unknown user ${userId}`);
    return p;
  };
  return { clock, repos, manager, changed, closed, online, profile };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

function expectError(result: { ok: boolean; error?: { code: string } }, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error?.code).toBe(code);
}

async function quickBattle(rig: Rig): Promise<GameSession> {
  const session = unwrap(rig.manager.createQuickMatch(await rig.profile('alice'), await rig.profile('bob')));
  unwrap(rig.manager.confirmFleet('alice', FLEET_TOP));
  unwrap(rig.manager.confirmFleet('bob', FLEET_BOTTOM));
  rig.clock.advance(TIMINGS.battleCountdownMs);
  expect(session.phase).toBe('IN_BATTLE');
  return session;
}

describe('SessionManager', () => {
  it('creates private rooms with unique codes and enforces one game per user', async () => {
    const rig = createRig();
    const session = unwrap(rig.manager.createPrivateRoom(await rig.profile('alice')));
    expect(session.mode).toBe('PRIVATE');
    expect(session.phase).toBe('WAITING');
    expect(session.roomCode).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    expect(rig.manager.getUserSession('alice')).toBe(session);
    expect(rig.manager.getSessionByCode(session.roomCode!)).toBe(session);
    expect(rig.manager.liveGameCount()).toBe(1);

    expectError(rig.manager.createPrivateRoom(await rig.profile('alice')), 'ALREADY_IN_GAME');
    expectError(rig.manager.createPractice(await rig.profile('alice'), 'easy'), 'ALREADY_IN_GAME');
    expect(rig.manager.size).toBe(1);

    const codes = new Set<string>();
    for (const id of ['bob', 'carol']) codes.add(unwrap(rig.manager.createPrivateRoom(await rig.profile(id))).roomCode!);
    codes.add(session.roomCode!);
    expect(codes.size).toBe(3);
  });

  it('joins rooms by code and reports ROOM_NOT_FOUND / ROOM_FULL', async () => {
    const rig = createRig();
    const session = unwrap(rig.manager.createPrivateRoom(await rig.profile('alice')));
    const code = session.roomCode!;
    expectError(rig.manager.joinRoom(await rig.profile('bob'), 'ZZZZZZ'), 'ROOM_NOT_FOUND');
    expect(unwrap(rig.manager.joinRoom(await rig.profile('bob'), code))).toBe(session);
    expect(rig.manager.getUserSession('bob')).toBe(session);
    expectError(rig.manager.joinRoom(await rig.profile('carol'), code), 'ROOM_FULL');
    // A participant re-joining (invite link after a refresh) simply gets the game back.
    expect(unwrap(rig.manager.joinRoom(await rig.profile('bob'), code))).toBe(session);
    expect(session.playerCount()).toBe(2);

    unwrap(rig.manager.setReady('alice', true));
    unwrap(rig.manager.setReady('bob', true));
    rig.clock.advance(TIMINGS.lobbyCountdownMs);
    expect(session.phase).toBe('PLACING_SHIPS');
    expect(rig.changed.filter((c) => c.gameId === session.id).at(-1)?.events).toEqual([{ type: 'phase', phase: 'PLACING_SHIPS' }]);
    expectError(rig.manager.joinRoom(await rig.profile('carol'), code), 'ROOM_FULL');
  });

  it('records finished games, applies rating changes and re-broadcasts', async () => {
    const rig = createRig();
    const session = await quickBattle(rig);
    unwrap(rig.manager.attack('alice', { x: 5, y: 5 }, 1));
    const broadcastsBefore = rig.changed.filter((c) => c.gameId === session.id).length;
    unwrap(rig.manager.forfeit('alice'));
    expect(session.phase).toBe('FINISHED');
    // recordMatch is invoked synchronously when the game finishes.
    expect(rig.repos.matches.calls).toHaveLength(1);
    const call = rig.repos.matches.calls[0]!;
    expect(call).toMatchObject({ id: session.id, mode: 'QUICK', endReason: 'FORFEIT', winnerUserId: 'bob', totalMoves: 1 });
    expect(call.participants[0]).toMatchObject({ userId: 'alice', won: false, shots: 1, hits: 1, isAi: false });
    expect(call.participants[1]).toMatchObject({ userId: 'bob', won: true, shots: 0, hits: 0 });
    expect(call.startedAt.getTime()).toBe(session.startedAt);

    await rig.manager.whenIdle();
    const snapA = buildSnapshot(session, 'alice');
    const snapB = buildSnapshot(session, 'bob');
    expect(snapA.result?.ratingChange).toBeLessThan(0);
    expect(snapB.result?.ratingChange).toBeGreaterThan(0);
    expect(snapB.result?.achievements).toContain('first_victory');
    expect(snapB.me.rating).toBe(1000 + snapB.result!.ratingChange!);
    const broadcastsAfter = rig.changed.filter((c) => c.gameId === session.id);
    // finish broadcast + persistence broadcast
    expect(broadcastsAfter.length).toBe(broadcastsBefore + 2);
    expect(broadcastsAfter.at(-1)?.events).toEqual([]);
    expect(rig.manager.liveGameCount()).toBe(0);
  });

  it('still broadcasts a final snapshot when persistence fails', async () => {
    const rig = createRig();
    const session = await quickBattle(rig);
    rig.repos.matches.failWith = new Error('db down');
    const before = rig.changed.filter((c) => c.gameId === session.id).length;
    unwrap(rig.manager.forfeit('bob'));
    await rig.manager.whenIdle();
    expect(rig.changed.filter((c) => c.gameId === session.id).length).toBe(before + 2);
    expect(buildSnapshot(session, 'alice').result).toMatchObject({ winner: 'me', reason: 'FORFEIT' });
    expect(buildSnapshot(session, 'alice').result?.ratingChange).toBeUndefined();
  });

  it('does not record cancelled games', async () => {
    const rig = createRig();
    const session = unwrap(rig.manager.createQuickMatch(await rig.profile('alice'), await rig.profile('bob')));
    rig.clock.advance(TIMINGS.placementTimeoutMs);
    expect(session.phase).toBe('FINISHED');
    expect(session.result?.reason).toBe('CANCELLED');
    await rig.manager.whenIdle();
    expect(rig.repos.matches.calls).toHaveLength(0);
    // Both players can start something new (the finished game is auto-left).
    unwrap(rig.manager.createPractice(await rig.profile('alice'), 'easy'));
    expect(rig.closed).toContainEqual({ userId: 'alice', gameId: session.id, reason: 'left' });
  });

  it('auto-leaves a finished game when the user starts a new one, which blocks the rematch', async () => {
    const rig = createRig();
    const old = await quickBattle(rig);
    unwrap(rig.manager.forfeit('alice'));
    const room = unwrap(rig.manager.createPrivateRoom(await rig.profile('alice')));
    expect(room).not.toBe(old);
    expect(rig.manager.getUserSession('alice')).toBe(room);
    expect(rig.closed).toEqual([{ userId: 'alice', gameId: old.id, reason: 'left' }]);
    expect(old.players[0]).toBeNull();
    expect(buildSnapshot(old, 'bob').opponent).toBeNull();
    expect(rig.changed.filter((c) => c.gameId === old.id).at(-1)?.events).toEqual([{ type: 'left', player: 0 }]);
    expectError(await rig.manager.rematch('bob', true), 'OPPONENT_LEFT');
    // When bob leaves too, the old game disappears.
    unwrap(rig.manager.leave('bob'));
    expect(rig.manager.getSession(old.id)).toBeNull();
    expect(rig.manager.getUserSession('bob')).toBeNull();
  });

  it('creates a new game (same room code) when both players accept a rematch', async () => {
    const rig = createRig();
    const old = unwrap(rig.manager.createPrivateRoom(await rig.profile('alice')));
    const code = old.roomCode!;
    unwrap(rig.manager.joinRoom(await rig.profile('bob'), code));
    unwrap(rig.manager.setReady('alice', true));
    unwrap(rig.manager.setReady('bob', true));
    rig.clock.advance(TIMINGS.lobbyCountdownMs);
    unwrap(rig.manager.confirmFleet('alice', FLEET_TOP));
    unwrap(rig.manager.confirmFleet('bob', FLEET_BOTTOM));
    rig.clock.advance(TIMINGS.battleCountdownMs);
    unwrap(rig.manager.forfeit('bob'));
    await rig.manager.whenIdle();

    unwrap(await rig.manager.rematch('alice', true));
    expect(rig.manager.getUserSession('alice')).toBe(old);
    unwrap(await rig.manager.rematch('bob', true));

    const next = rig.manager.getUserSession('alice')!;
    expect(next).not.toBe(old);
    expect(next.id).not.toBe(old.id);
    expect(next).toMatchObject({ mode: 'PRIVATE', roomCode: code, phase: 'PLACING_SHIPS' });
    expect(rig.manager.getUserSession('bob')).toBe(next);
    expect(rig.manager.getSessionByCode(code)).toBe(next);
    expect(rig.manager.getSession(old.id)).toBeNull();
    expect(old.disposed).toBe(true);
    expect(next.players[0]?.userId).toBe('alice');
    expect(next.players[1]?.userId).toBe('bob');
    // Ratings were refreshed from the store after the first match.
    expect(next.players[0]?.rating).toBeGreaterThan(1000);
    expect(next.players[1]?.rating).toBeLessThan(1000);
    expect(rig.closed).toEqual([]);
    const snap = buildSnapshot(next, 'alice');
    expect(snap).toMatchObject({ phase: 'PLACING_SHIPS', roomCode: code, history: [], result: null });
    expect(snap.myBoard.fleet).toEqual([]);
    expect(rig.manager.size).toBe(1);
  });

  it('starts a practice rematch immediately (the AI always accepts)', async () => {
    const rig = createRig();
    const old = unwrap(rig.manager.createPractice(await rig.profile('alice'), 'medium'));
    unwrap(rig.manager.confirmFleet('alice', FLEET_TOP));
    rig.clock.advance(TIMINGS.battleCountdownMs);
    unwrap(rig.manager.forfeit('alice'));
    await rig.manager.whenIdle();
    expect(rig.repos.matches.calls[0]).toMatchObject({ mode: 'PRACTICE', winnerUserId: null, endReason: 'FORFEIT' });
    expect(rig.repos.matches.calls[0]?.participants[1]).toMatchObject({ isAi: true, aiDifficulty: 'medium', won: true, userId: null });
    expect(buildSnapshot(old, 'alice').result?.ratingChange).toBeUndefined();

    unwrap(await rig.manager.rematch('alice', true));
    const next = rig.manager.getUserSession('alice')!;
    expect(next).not.toBe(old);
    expect(next).toMatchObject({ mode: 'PRACTICE', phase: 'PLACING_SHIPS' });
    expect(next.players[1]).toMatchObject({ isAi: true, aiDifficulty: 'medium' });
    expect(next.players[1]?.board).not.toBeNull();
  });

  it('plays a practice game against the AI end to end', async () => {
    const rig = createRig({ fairCoin: () => 1 });
    const session = unwrap(rig.manager.createPractice(await rig.profile('alice'), 'easy'));
    unwrap(rig.manager.confirmFleet('alice', FLEET_TOP));
    rig.clock.advance(TIMINGS.battleCountdownMs);
    expect(session.phase).toBe('IN_BATTLE');
    rig.clock.advance(TIMINGS.aiMoveDelayMs);
    expect(session.history).toHaveLength(1);
    const targets = cellsOf(session.players[1]!.board!.fleet);
    for (const target of targets) {
      unwrap(rig.manager.attack('alice', target, session.moveNumber));
      if (session.phase === 'IN_BATTLE') rig.clock.advance(TIMINGS.aiMoveDelayMs);
    }
    expect(session.result).toMatchObject({ winner: 0, reason: 'ALL_SUNK' });
    await rig.manager.whenIdle();
    expect(rig.repos.matches.calls[0]).toMatchObject({ mode: 'PRACTICE', winnerUserId: 'alice', endReason: 'ALL_SUNK' });
    expect(rig.repos.matches.calls[0]?.participants[0]).toMatchObject({ userId: 'alice', won: true, shots: 17, hits: 17 });
    expect(rig.clock.pending()).toBe(0);
  });

  it('removes a disconnected host from a WAITING room after the grace period and frees the code', async () => {
    const rig = createRig();
    const session = unwrap(rig.manager.createPrivateRoom(await rig.profile('alice')));
    const code = session.roomCode!;
    rig.online.delete('alice');
    rig.manager.setUserConnected('alice', false);
    rig.clock.advance(TIMINGS.reconnectGraceMs - 1);
    expect(rig.manager.getSession(session.id)).toBe(session);
    rig.clock.advance(1);
    expect(rig.manager.getSession(session.id)).toBeNull();
    expect(rig.manager.getUserSession('alice')).toBeNull();
    expect(rig.manager.getSessionByCode(code)).toBeNull();
    expectError(rig.manager.joinRoom(await rig.profile('bob'), code), 'ROOM_NOT_FOUND');
    expect(rig.closed).toEqual([{ userId: 'alice', gameId: session.id, reason: 'disconnected' }]);
    expect(rig.clock.pending()).toBe(0);
  });

  it('starts the grace timer immediately for a player who is offline when the game is created', async () => {
    const rig = createRig();
    rig.online.delete('bob');
    const session = unwrap(rig.manager.createQuickMatch(await rig.profile('alice'), await rig.profile('bob')));
    expect(session.players[1]?.connected).toBe(false);
    expect(buildSnapshot(session, 'alice').opponentReconnectDeadline).toBe(rig.clock.now() + TIMINGS.reconnectGraceMs);
    rig.clock.advance(TIMINGS.reconnectGraceMs);
    expect(session.phase).toBe('FINISHED');
    expect(session.result?.reason).toBe('CANCELLED');
  });

  it('abandons an active battle when the opponent never comes back', async () => {
    const rig = createRig();
    const session = await quickBattle(rig);
    rig.manager.setUserConnected('bob', false);
    rig.clock.advance(TIMINGS.reconnectGraceMs);
    expect(session.result).toMatchObject({ winner: 0, reason: 'ABANDONED' });
    expect(rig.manager.getUserSession('bob')).toBeNull();
    expect(rig.manager.getUserSession('alice')).toBe(session);
    await rig.manager.whenIdle();
    expect(rig.repos.matches.calls[0]).toMatchObject({ endReason: 'ABANDONED', winnerUserId: 'alice' });
  });

  it('clears every timer on close()', async () => {
    const rig = createRig();
    await quickBattle(rig);
    unwrap(rig.manager.createPrivateRoom(await rig.profile('carol')));
    rig.manager.setUserConnected('carol', false);
    expect(rig.clock.pending()).toBeGreaterThan(0);
    rig.manager.close();
    expect(rig.clock.pending()).toBe(0);
    expect(rig.manager.size).toBe(0);
    expect(rig.manager.getUserSession('alice')).toBeNull();
  });
});
