import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, SHIP_SPECS, SHIP_TYPES, coordKey, type ShipType } from '../src/constants';
import { createBoard, receiveAttack, toEnemyBoardView } from '../src/engine/board';
import { isInsideBoard, randomFleet, shipCells, type Rng } from '../src/engine/placement';
import { createAi } from '../src/ai';
import { chooseEasyShot } from '../src/ai/easy';
import { chooseHardShot } from '../src/ai/hard';
import { chooseMediumShot } from '../src/ai/medium';
import type { AiDifficulty, Coord, EnemyBoardView, Shot, SunkShip } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIFFICULTIES: AiDifficulty[] = ['easy', 'medium', 'hard'];

/** Small seeded PRNG (mulberry32) so every test is deterministic. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shot(x: number, y: number, outcome: Shot['outcome']): Shot {
  return { x, y, outcome };
}

function miss(x: number, y: number): Shot {
  return shot(x, y, 'miss');
}

function hit(x: number, y: number): Shot {
  return shot(x, y, 'hit');
}

/** A view with `remaining` defaulting to every type not listed in `sunkShips`. */
function makeView(parts: { shots?: Shot[]; sunkShips?: SunkShip[]; remaining?: ShipType[] } = {}): EnemyBoardView {
  const sunkShips = parts.sunkShips ?? [];
  const sunkTypes = new Set(sunkShips.map((s) => s.type));
  return {
    shots: parts.shots ?? [],
    sunkShips,
    remaining: parts.remaining ?? SHIP_TYPES.filter((t) => !sunkTypes.has(t)),
  };
}

/** A sunk ship plus the shots that sank it (hits, then the sinking shot on the last cell). */
function sunk(type: ShipType, cells: Coord[]): { ship: SunkShip; shots: Shot[] } {
  const shots = cells.map((c, i) => shot(c.x, c.y, i === cells.length - 1 ? 'sunk' : 'hit'));
  return { ship: { type, cells }, shots };
}

function sameCell(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function isOrthogonalNeighbour(a: Coord, b: Coord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function isTried(view: EnemyBoardView, c: Coord): boolean {
  return view.shots.some((s) => sameCell(s, c));
}

/**
 * Independent brute-force check: a cell is dead when no remaining ship can be placed through it
 * without touching a miss, a sunk cell or the board edge. Unresolved hits do not block.
 */
function isDeadCell(view: EnemyBoardView, cell: Coord): boolean {
  const blocked = new Set<string>();
  for (const s of view.shots) if (s.outcome !== 'hit') blocked.add(coordKey(s));
  for (const ship of view.sunkShips) for (const c of ship.cells) blocked.add(coordKey(c));
  for (const type of view.remaining) {
    const size = SHIP_SPECS[type].size;
    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (let offset = 0; offset < size; offset++) {
        const anchor = orientation === 'horizontal' ? { x: cell.x - offset, y: cell.y } : { x: cell.x, y: cell.y - offset };
        const cells = shipCells({ type, orientation, ...anchor });
        if (cells.every((c) => isInsideBoard(c) && !blocked.has(coordKey(c)))) return false;
      }
    }
  }
  return true;
}

interface GameResult {
  shots: number;
  finished: boolean;
  repeated: number;
  outOfBounds: number;
  rejected: number;
  /** Shots at cells no remaining ship could occupy (checked for hard only). */
  deadShots: number;
}

/** Plays one full game of the AI against a random fleet, using only the engine's enemy view. */
function playGame(difficulty: AiDifficulty, seed: number): GameResult {
  const fleet = randomFleet(mulberry32(seed * 7919 + 17));
  const board = createBoard(fleet);
  const ai = createAi(difficulty, { rng: mulberry32(seed) });
  const fired = new Set<string>();
  const result: GameResult = { shots: 0, finished: false, repeated: 0, outOfBounds: 0, rejected: 0, deadShots: 0 };
  for (let n = 1; n <= BOARD_SIZE * BOARD_SIZE; n++) {
    const view = toEnemyBoardView(board);
    const target = ai.chooseShot(view);
    result.shots = n;
    if (!isInsideBoard(target)) result.outOfBounds++;
    const key = coordKey(target);
    if (fired.has(key)) result.repeated++;
    fired.add(key);
    if (difficulty === 'hard' && isDeadCell(view, target)) result.deadShots++;
    const attack = receiveAttack(board, target);
    if (!attack.ok) {
      result.rejected++;
      break;
    }
    if (attack.allSunk) {
      result.finished = true;
      break;
    }
  }
  return result;
}

const GAMES = 100;
const gameCache = new Map<AiDifficulty, GameResult[]>();

function playGames(difficulty: AiDifficulty): GameResult[] {
  let games = gameCache.get(difficulty);
  if (!games) {
    games = Array.from({ length: GAMES }, (_, i) => playGame(difficulty, i + 1));
    gameCache.set(difficulty, games);
  }
  return games;
}

function averageShots(difficulty: AiDifficulty): number {
  const games = playGames(difficulty);
  return games.reduce((sum, g) => sum + g.shots, 0) / games.length;
}

/** Shots chosen for the same view under many different rng seeds. */
function sampleShots(choose: (view: EnemyBoardView, rng: Rng) => Coord, view: EnemyBoardView, seeds = 40): Coord[] {
  return Array.from({ length: seeds }, (_, i) => choose(view, mulberry32(1000 + i)));
}

const CHOOSERS: Record<AiDifficulty, (view: EnemyBoardView, rng: Rng) => Coord> = {
  easy: chooseEasyShot,
  medium: chooseMediumShot,
  hard: chooseHardShot,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createAi', () => {
  it.each(DIFFICULTIES)('creates a %s opponent that reports its difficulty', (difficulty) => {
    const ai = createAi(difficulty, { rng: mulberry32(1) });
    expect(ai.difficulty).toBe(difficulty);
    const first = ai.chooseShot(makeView());
    expect(isInsideBoard(first)).toBe(true);
  });

  it('works without options (Math.random)', () => {
    const ai = createAi('medium');
    expect(isInsideBoard(ai.chooseShot(makeView()))).toBe(true);
  });

  it('rejects an unknown difficulty', () => {
    expect(() => createAi('impossible' as AiDifficulty)).toThrow(/Unknown AI difficulty/);
  });
});

// ---------------------------------------------------------------------------
// Full games against random fleets
// ---------------------------------------------------------------------------

describe('full games against random fleets', () => {
  it.each(DIFFICULTIES)(`%s never repeats a cell, stays in bounds and finishes within 100 shots (${GAMES} games)`, (difficulty) => {
    for (const game of playGames(difficulty)) {
      expect(game.outOfBounds).toBe(0);
      expect(game.repeated).toBe(0);
      expect(game.rejected).toBe(0);
      expect(game.finished).toBe(true);
      expect(game.shots).toBeLessThanOrEqual(100);
    }
  });

  it('average shots to win: easy > medium > hard', () => {
    const easy = averageShots('easy');
    const medium = averageShots('medium');
    const hard = averageShots('hard');
    // Measured with these seeds: easy ~66, medium ~49, hard ~45.
    expect(easy).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(hard);
  });

  it('hard averages well under 60 shots and medium well under 75', () => {
    expect(averageShots('hard')).toBeLessThan(55);
    expect(averageShots('medium')).toBeLessThan(65);
  });

  it('easy is clearly weaker than a parity hunter but better than pure random fire', () => {
    const easy = averageShots('easy');
    expect(easy).toBeGreaterThan(55);
    expect(easy).toBeLessThan(90);
  });

  it('hard never fires at a cell that cannot contain any remaining ship (full games)', () => {
    const dead = playGames('hard').reduce((sum, g) => sum + g.deadShots, 0);
    expect(dead).toBe(0);
  });

  it.each(DIFFICULTIES)('%s is deterministic for a given rng seed', (difficulty) => {
    const run = (): Coord[] => {
      const board = createBoard(randomFleet(mulberry32(99)));
      const ai = createAi(difficulty, { rng: mulberry32(7) });
      const sequence: Coord[] = [];
      for (let n = 0; n < 100; n++) {
        const target = ai.chooseShot(toEnemyBoardView(board));
        sequence.push(target);
        const attack = receiveAttack(board, target);
        if (!attack.ok || attack.allSunk) break;
      }
      return sequence;
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// Medium: hunt / target
// ---------------------------------------------------------------------------

describe('medium', () => {
  it('extends a horizontal line of two hits at either end', () => {
    const view = makeView({ shots: [hit(3, 3), hit(4, 3)] });
    const picks = sampleShots(chooseMediumShot, view);
    for (const p of picks) expect([coordKey({ x: 2, y: 3 }), coordKey({ x: 5, y: 3 })]).toContain(coordKey(p));
    expect(new Set(picks.map(coordKey)).size).toBe(2);
  });

  it('extends a vertical line of two hits at either end', () => {
    const view = makeView({ shots: [hit(6, 2), hit(6, 3)] });
    for (const p of sampleShots(chooseMediumShot, view)) {
      expect([coordKey({ x: 6, y: 1 }), coordKey({ x: 6, y: 4 })]).toContain(coordKey(p));
    }
  });

  it('skips the tried cells of the line and stops at misses and edges', () => {
    // Line reaches the right edge; the only open end is on the left.
    const edge = makeView({ shots: [hit(8, 5), hit(9, 5)] });
    for (const p of sampleShots(chooseMediumShot, edge)) expect(p).toEqual({ x: 7, y: 5 });

    // A miss closes one end; the line of three is extended on the other side only.
    const blocked = makeView({ shots: [miss(2, 7), hit(3, 7), hit(4, 7), hit(5, 7)] });
    for (const p of sampleShots(chooseMediumShot, blocked)) expect(p).toEqual({ x: 6, y: 7 });
  });

  it('prefers the line over perpendicular neighbours', () => {
    const view = makeView({ shots: [hit(4, 4), hit(5, 4)] });
    for (const p of sampleShots(chooseMediumShot, view)) expect(p.y).toBe(4);
  });

  it('fires at an orthogonal neighbour of a single unresolved hit', () => {
    const view = makeView({ shots: [hit(4, 4)] });
    const picks = sampleShots(chooseMediumShot, view);
    for (const p of picks) expect(isOrthogonalNeighbour(p, { x: 4, y: 4 })).toBe(true);
    expect(new Set(picks.map(coordKey)).size).toBe(4);
  });

  it('focuses on the newest unresolved hit when no line exists', () => {
    // The old hit at (0,0) is boxed in by misses; the newest hit at (7,7) is open.
    const view = makeView({ shots: [hit(0, 0), miss(1, 0), miss(0, 1), hit(7, 7)] });
    for (const p of sampleShots(chooseMediumShot, view)) expect(isOrthogonalNeighbour(p, { x: 7, y: 7 })).toBe(true);
  });

  it('handles adjacent hits that belong to different ships without crashing', () => {
    // Two hits in a row whose line is closed on both sides: they must be two parallel ships.
    const view = makeView({ shots: [miss(2, 3), hit(3, 3), hit(4, 3), miss(5, 3)] });
    const perpendicular = [coordKey({ x: 3, y: 2 }), coordKey({ x: 3, y: 4 }), coordKey({ x: 4, y: 2 }), coordKey({ x: 4, y: 4 })];
    for (const p of sampleShots(chooseMediumShot, view)) expect(perpendicular).toContain(coordKey(p));
  });

  it('falls back to hunting when no unresolved hit has an untried neighbour', () => {
    const view = makeView({ shots: [hit(0, 0), miss(1, 0), miss(0, 1)] });
    for (const p of sampleShots(chooseMediumShot, view)) {
      expect(isInsideBoard(p)).toBe(true);
      expect(isTried(view, p)).toBe(false);
    }
  });

  it('hunts on a checkerboard while the destroyer is afloat', () => {
    const picks = sampleShots(chooseMediumShot, makeView(), 60);
    const parities = new Set(picks.map((p) => (p.x + p.y) % 2));
    expect(parities.size).toBe(1);
    // Spread across the board, not clustered.
    expect(new Set(picks.map(coordKey)).size).toBeGreaterThan(20);
  });

  it('widens the parity lattice to the smallest remaining ship', () => {
    const destroyer = sunk('destroyer', [{ x: 0, y: 9 }, { x: 1, y: 9 }]);
    const view = makeView({ shots: destroyer.shots, sunkShips: [destroyer.ship] });
    const picks = sampleShots(chooseMediumShot, view, 60);
    const classes = new Set(picks.map((p) => (p.x + p.y) % 3));
    expect(classes.size).toBe(1);
  });

  it('switches back to hunt mode once the hit ship is sunk', () => {
    const cruiser = sunk('cruiser', [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }]);
    const view = makeView({ shots: cruiser.shots, sunkShips: [cruiser.ship] });
    const picks = sampleShots(chooseMediumShot, view, 60);
    const nearSunk = picks.filter((p) => cruiser.ship.cells.some((c) => isOrthogonalNeighbour(p, c)));
    expect(nearSunk.length).toBeLessThan(picks.length / 2);
    for (const p of picks) {
      expect(cruiser.ship.cells.some((c) => sameCell(c, p))).toBe(false);
      expect((p.x + p.y) % 2).toBe((picks[0]!.x + picks[0]!.y) % 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Hard: probability density
// ---------------------------------------------------------------------------

describe('hard', () => {
  it('never fires at isolated cells that cannot hold any remaining ship', () => {
    const destroyer = sunk('destroyer', [{ x: 7, y: 7 }, { x: 8, y: 7 }]);
    const view = makeView({
      shots: [
        ...destroyer.shots,
        // (0,0) is a single-cell pocket in the corner.
        miss(1, 0),
        miss(0, 1),
        // (3,0),(4,0) is a two-cell pocket on the top edge: too small for the cruiser and up.
        miss(2, 0),
        miss(5, 0),
        miss(3, 1),
        miss(4, 1),
        // (9,4) is a single cell between misses on the right edge.
        miss(9, 3),
        miss(9, 5),
        miss(8, 4),
      ],
      sunkShips: [destroyer.ship],
    });
    const deadCells = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 9, y: 4 }];
    for (const c of deadCells) expect(isDeadCell(view, c)).toBe(true);

    for (const p of sampleShots(chooseHardShot, view, 60)) {
      expect(deadCells.some((c) => sameCell(c, p))).toBe(false);
      expect(isDeadCell(view, p)).toBe(false);
      expect(isTried(view, p)).toBe(false);
    }
  });

  it('treats the cells of sunk ships as blocked when weighing neighbours of a hit', () => {
    // Hit at (3,3). Its right neighbour (4,3) is boxed in: (5,3) belongs to the sunk destroyer, (2,3) is a miss,
    // and (4,2)/(4,4) are misses, so no remaining ship (all size >= 3) fits through (4,3).
    const destroyer = sunk('destroyer', [{ x: 5, y: 3 }, { x: 5, y: 4 }]);
    const view = makeView({
      shots: [...destroyer.shots, hit(3, 3), miss(2, 3), miss(4, 2), miss(4, 4)],
      sunkShips: [destroyer.ship],
    });
    expect(isDeadCell(view, { x: 4, y: 3 })).toBe(true);
    for (const p of sampleShots(chooseHardShot, view)) {
      expect([coordKey({ x: 3, y: 2 }), coordKey({ x: 3, y: 4 })]).toContain(coordKey(p));
    }
  });

  it('extends a line of two hits', () => {
    const view = makeView({ shots: [hit(3, 3), hit(4, 3)] });
    for (const p of sampleShots(chooseHardShot, view)) {
      expect([coordKey({ x: 2, y: 3 }), coordKey({ x: 5, y: 3 })]).toContain(coordKey(p));
    }
  });

  it('targets an orthogonal neighbour of a single hit', () => {
    const view = makeView({ shots: [hit(4, 4)] });
    for (const p of sampleShots(chooseHardShot, view)) expect(isOrthogonalNeighbour(p, { x: 4, y: 4 })).toBe(true);
  });

  it('picks the direction with the most room around a hit', () => {
    // Hit in the corner region: only right and down are open; (0,1) sits under a miss at (0,2) so down is cramped.
    const view = makeView({ shots: [hit(0, 0), miss(0, 2)] });
    for (const p of sampleShots(chooseHardShot, view)) expect(p).toEqual({ x: 1, y: 0 });
  });

  it('opens the game on the densest cells', () => {
    for (const p of sampleShots(chooseHardShot, makeView())) {
      expect([4, 5]).toContain(p.x);
      expect([4, 5]).toContain(p.y);
    }
  });

  it('switches back to hunt mode once the hit ship is sunk', () => {
    const destroyer = sunk('destroyer', [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    const view = makeView({ shots: destroyer.shots, sunkShips: [destroyer.ship] });
    for (const p of sampleShots(chooseHardShot, view)) {
      expect(destroyer.ship.cells.some((c) => isOrthogonalNeighbour(p, c))).toBe(false);
      // Back to the densest region of the board.
      expect([4, 5]).toContain(p.x);
      expect([4, 5]).toContain(p.y);
    }
  });

  it('keeps targeting a second ship whose hits remain after a sink', () => {
    // Cruiser sunk vertically at column 4; one more unresolved hit at (6,6) from another ship.
    const cruiser = sunk('cruiser', [{ x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 }]);
    const view = makeView({ shots: [hit(6, 6), ...cruiser.shots], sunkShips: [cruiser.ship] });
    for (const p of sampleShots(chooseHardShot, view)) expect(isOrthogonalNeighbour(p, { x: 6, y: 6 })).toBe(true);
  });

  it('falls back to hunting when an unresolved hit has no untried neighbour', () => {
    const view = makeView({ shots: [hit(0, 0), miss(1, 0), miss(0, 1)] });
    for (const p of sampleShots(chooseHardShot, view)) {
      expect(isTried(view, p)).toBe(false);
      expect(isDeadCell(view, p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Easy
// ---------------------------------------------------------------------------

describe('easy', () => {
  it('follows up an unresolved hit about half of the time', () => {
    const view = makeView({ shots: [hit(5, 5)] });
    const rng = mulberry32(42);
    const samples = 1000;
    let adjacent = 0;
    for (let i = 0; i < samples; i++) {
      const p = chooseEasyShot(view, rng);
      expect(isTried(view, p)).toBe(false);
      if (isOrthogonalNeighbour(p, { x: 5, y: 5 })) adjacent++;
    }
    // 50% deliberate follow-up plus a ~2% chance of landing next to the hit at random.
    expect(adjacent / samples).toBeGreaterThan(0.42);
    expect(adjacent / samples).toBeLessThan(0.62);
  });

  it('hunts without parity', () => {
    const picks = sampleShots(chooseEasyShot, makeView(), 60);
    expect(new Set(picks.map((p) => (p.x + p.y) % 2)).size).toBe(2);
  });

  it('only follows up with untried orthogonal neighbours', () => {
    const view = makeView({ shots: [hit(9, 9), miss(8, 9)] });
    const rng = mulberry32(3);
    let followUps = 0;
    for (let i = 0; i < 400; i++) {
      const p = chooseEasyShot(view, rng);
      expect(isTried(view, p)).toBe(false);
      if (isOrthogonalNeighbour(p, { x: 9, y: 9 })) {
        followUps++;
        expect(p).toEqual({ x: 9, y: 8 });
      }
    }
    expect(followUps).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Edge cases shared by every difficulty
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  const allCells: Coord[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) allCells.push({ x, y });

  it.each(DIFFICULTIES)('%s fires at the last untried cell when only one is left', (difficulty) => {
    const last = { x: 7, y: 2 };
    const shots = allCells.filter((c) => !sameCell(c, last)).map((c) => miss(c.x, c.y));
    const view = makeView({ shots });
    for (let seed = 0; seed < 5; seed++) expect(CHOOSERS[difficulty](view, mulberry32(seed))).toEqual(last);
  });

  it.each(DIFFICULTIES)('%s throws once every cell has been fired at', (difficulty) => {
    const view = makeView({ shots: allCells.map((c) => miss(c.x, c.y)) });
    expect(() => CHOOSERS[difficulty](view, mulberry32(1))).toThrow(/No untried cells/);
  });

  it.each(DIFFICULTIES)('%s still returns an untried cell when the view lists no remaining ships', (difficulty) => {
    const view = makeView({ shots: [miss(0, 0), hit(5, 5)], remaining: [] });
    for (const p of sampleShots(CHOOSERS[difficulty], view, 10)) {
      expect(isInsideBoard(p)).toBe(true);
      expect(isTried(view, p)).toBe(false);
    }
  });

  it.each(DIFFICULTIES)('%s does not mutate the view', (difficulty) => {
    const destroyer = sunk('destroyer', [{ x: 2, y: 2 }, { x: 3, y: 2 }]);
    const view = makeView({ shots: [hit(6, 6), miss(0, 0), ...destroyer.shots], sunkShips: [destroyer.ship] });
    const snapshot = JSON.stringify(view);
    CHOOSERS[difficulty](view, mulberry32(5));
    expect(JSON.stringify(view)).toBe(snapshot);
  });

  it.each(DIFFICULTIES)('%s ignores revealed sunk cells that were never reported as shots', (difficulty) => {
    const ship: SunkShip = { type: 'destroyer', cells: [{ x: 4, y: 4 }, { x: 5, y: 4 }] };
    const view = makeView({ shots: [shot(5, 4, 'sunk')], sunkShips: [ship] });
    for (const p of sampleShots(CHOOSERS[difficulty], view, 20)) {
      expect(isTried(view, p)).toBe(false);
      expect(ship.cells.some((c) => sameCell(c, p))).toBe(false);
    }
  });
});
