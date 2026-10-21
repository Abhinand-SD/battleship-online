import { randomFleet, type GamePlayerInfo, type GameSnapshot } from '@battleship/shared';

/** Small deterministic PRNG (mulberry32) so fixtures are stable across runs. */
export function seededRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePlayer(overrides: Partial<GamePlayerInfo> = {}): GamePlayerInfo {
  return {
    id: 'user-me',
    displayName: 'Captain Nova',
    avatar: 'anchor',
    isGuest: true,
    isAi: false,
    rating: 1000,
    connected: true,
    ready: false,
    fleetConfirmed: false,
    ...overrides,
  };
}

/** Builds a plausible snapshot for component tests. Defaults to an IN_BATTLE game where it is my turn. */
export function makeSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const now = Date.now();
  return {
    gameId: 'game-1',
    roomCode: null,
    mode: 'QUICK',
    phase: 'IN_BATTLE',
    me: makePlayer({ fleetConfirmed: true }),
    opponent: makePlayer({ id: 'user-opp', displayName: 'Admiral Reef', avatar: 'skull', fleetConfirmed: true }),
    myBoard: { fleet: randomFleet(seededRng(42)), shots: [], sunk: [], hits: {} },
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
