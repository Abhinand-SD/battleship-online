import { randomFleet, type GameSnapshot } from '@battleship/shared';
import { makePlayer } from '../../test/fixtures';

/** Small deterministic PRNG (mulberry32) so fixture fleets are stable between runs. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Battle-screen counterpart of `makeSnapshot` from `src/test/fixtures.ts`: identical defaults (an IN_BATTLE
 * game where it is my turn) but with a seeded fleet, because the shared fixture's constant RNG cannot place
 * a valid fleet and throws.
 */
export function makeBattleSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const now = Date.now();
  return {
    gameId: 'game-1',
    roomCode: null,
    mode: 'QUICK',
    phase: 'IN_BATTLE',
    me: makePlayer({ fleetConfirmed: true }),
    opponent: makePlayer({ id: 'user-opp', displayName: 'Admiral Reef', avatar: 'skull', fleetConfirmed: true }),
    myBoard: { fleet: randomFleet(seeded(42)), shots: [], sunk: [], hits: {} },
    enemyBoard: { shots: [], sunkShips: [], remaining: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] },
    turn: 'me',
    moveNumber: 1,
    turnDeadline: now + 45_000,
    countdownEndsAt: null,
    startedAt: now - 10_000,
    endedAt: null,
    history: [],
    result: null,
    rematch: null,
    opponentReconnectDeadline: null,
    serverTime: now,
    ...overrides,
  };
}
