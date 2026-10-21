import { BOARD_SIZE, SHIP_SPECS, SHIP_TYPES, coordKey, type ShipType } from '../constants';
import { isInsideBoard, type Rng } from '../engine/placement';
import type { Coord, EnemyBoardView, Orientation } from '../types';

/**
 * What the AI knows about one enemy cell, derived purely from the `EnemyBoardView`:
 * - `unknown`: never fired at.
 * - `miss`: fired at, nothing there.
 * - `hit`: fired at and hit, but the ship is still afloat (an "unresolved" hit).
 * - `sunk`: belongs to a sunk ship (its revealed cells, plus the shot that sank it). Blocked for every other ship.
 */
export type CellState = 'unknown' | 'miss' | 'hit' | 'sunk';

export interface ViewAnalysis {
  /** Flat row-major grid, index = y * BOARD_SIZE + x. */
  cells: CellState[];
  /** Cells never fired at (row-major order). */
  untried: Coord[];
  /** Hit cells that do not belong to any sunk ship, oldest shot first. */
  unresolvedHits: Coord[];
  /** Ship types still afloat (deduplicated, never including a revealed sunk type). */
  remainingTypes: ShipType[];
  /** Sizes of the ships still afloat, ascending. */
  remainingSizes: number[];
}

export const ORIENTATIONS: readonly Orientation[] = ['horizontal', 'vertical'];

const DIRECTIONS: readonly Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Precedence when several records describe the same cell (never happens with a consistent view). */
const STATE_RANK: Record<CellState, number> = { unknown: 0, miss: 1, hit: 2, sunk: 3 };

export function cellIndex(c: Coord): number {
  return c.y * BOARD_SIZE + c.x;
}

/** Builds everything the strategies need from the view. Pure: the view is never mutated. */
export function analyzeView(view: EnemyBoardView): ViewAnalysis {
  const cells: CellState[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => 'unknown' as CellState);

  const sunkTypes = new Set<ShipType>();
  for (const ship of view.sunkShips) {
    sunkTypes.add(ship.type);
    for (const c of ship.cells) if (isInsideBoard(c)) cells[cellIndex(c)] = 'sunk';
  }

  for (const shot of view.shots) {
    if (!isInsideBoard(shot)) continue;
    const i = cellIndex(shot);
    const next: CellState = shot.outcome === 'miss' ? 'miss' : shot.outcome === 'hit' ? 'hit' : 'sunk';
    if (STATE_RANK[next] > STATE_RANK[cells[i] ?? 'unknown']) cells[i] = next;
  }

  const unresolvedHits: Coord[] = [];
  const seenHits = new Set<number>();
  for (const shot of view.shots) {
    if (!isInsideBoard(shot)) continue;
    const i = cellIndex(shot);
    if (cells[i] === 'hit' && !seenHits.has(i)) {
      seenHits.add(i);
      unresolvedHits.push({ x: shot.x, y: shot.y });
    }
  }

  const untried: Coord[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (cells[y * BOARD_SIZE + x] === 'unknown') untried.push({ x, y });
    }
  }

  const remainingTypes: ShipType[] = [];
  for (const type of view.remaining) {
    if (!(SHIP_TYPES as readonly string[]).includes(type)) continue;
    if (sunkTypes.has(type) || remainingTypes.includes(type)) continue;
    remainingTypes.push(type);
  }
  const remainingSizes = remainingTypes.map((t) => SHIP_SPECS[t].size).sort((a, b) => a - b);

  return { cells, untried, unresolvedHits, remainingTypes, remainingSizes };
}

/** State of a cell, or `edge` when the coordinate is outside the board. */
export function stateAt(a: ViewAnalysis, x: number, y: number): CellState | 'edge' {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return 'edge';
  return a.cells[y * BOARD_SIZE + x] ?? 'unknown';
}

/** Untried orthogonal neighbours of `c`. */
export function untriedNeighbours(a: ViewAnalysis, c: Coord): Coord[] {
  const out: Coord[] = [];
  for (const d of DIRECTIONS) {
    const x = c.x + d.x;
    const y = c.y + d.y;
    if (stateAt(a, x, y) === 'unknown') out.push({ x, y });
  }
  return out;
}

/** Untried cells orthogonally adjacent to at least one unresolved hit, each listed once. */
export function cellsAdjacentToHits(a: ViewAnalysis): Coord[] {
  const seen = new Set<number>();
  const out: Coord[] = [];
  for (const hit of a.unresolvedHits) {
    for (const n of untriedNeighbours(a, hit)) {
      const i = cellIndex(n);
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(n);
    }
  }
  return out;
}

/**
 * Line-extension candidates: for every maximal run of two or more collinear, adjacent unresolved hits,
 * the cell just beyond each end of the run, provided it is untried. Runs are maximal, so the cell beyond an
 * end is either untried (a candidate), a miss, a sunk cell or the board edge (the line stops there).
 */
export function lineExtensionCells(a: ViewAnalysis): Coord[] {
  const seen = new Set<number>();
  const out: Coord[] = [];
  const add = (x: number, y: number): void => {
    if (stateAt(a, x, y) !== 'unknown') return;
    const i = y * BOARD_SIZE + x;
    if (seen.has(i)) return;
    seen.add(i);
    out.push({ x, y });
  };

  for (let y = 0; y < BOARD_SIZE; y++) {
    let x = 0;
    while (x < BOARD_SIZE) {
      if (stateAt(a, x, y) !== 'hit') {
        x++;
        continue;
      }
      const start = x;
      while (stateAt(a, x, y) === 'hit') x++;
      if (x - start >= 2) {
        add(start - 1, y);
        add(x, y);
      }
    }
  }

  for (let x = 0; x < BOARD_SIZE; x++) {
    let y = 0;
    while (y < BOARD_SIZE) {
      if (stateAt(a, x, y) !== 'hit') {
        y++;
        continue;
      }
      const start = y;
      while (stateAt(a, x, y) === 'hit') y++;
      if (y - start >= 2) {
        add(x, start - 1);
        add(x, y);
      }
    }
  }

  return out;
}

/**
 * Probability-density map over the board. For every remaining ship and every placement consistent with the
 * view (no cell is a miss or part of a sunk ship), each untried cell of the placement receives the weight
 * `1 + hitBonus * hitsCovered`, where `hitsCovered` is the number of unresolved hits the placement covers.
 * Cells that cannot be part of any remaining ship end up with weight 0.
 */
export function placementDensity(a: ViewAnalysis, hitBonus = 5): Float64Array {
  const weights = new Float64Array(BOARD_SIZE * BOARD_SIZE);
  const indices: number[] = [];
  for (const size of a.remainingSizes) {
    for (const orientation of ORIENTATIONS) {
      const horizontal = orientation === 'horizontal';
      const maxX = horizontal ? BOARD_SIZE - size : BOARD_SIZE - 1;
      const maxY = horizontal ? BOARD_SIZE - 1 : BOARD_SIZE - size;
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
          let hits = 0;
          let consistent = true;
          indices.length = 0;
          for (let i = 0; i < size; i++) {
            const index = horizontal ? y * BOARD_SIZE + x + i : (y + i) * BOARD_SIZE + x;
            const state = a.cells[index] ?? 'unknown';
            if (state === 'miss' || state === 'sunk') {
              consistent = false;
              break;
            }
            if (state === 'hit') hits++;
            else indices.push(index);
          }
          if (!consistent || indices.length === 0) continue;
          const weight = 1 + hitBonus * hits;
          for (const index of indices) weights[index] = (weights[index] ?? 0) + weight;
        }
      }
    }
  }
  return weights;
}

/** Among `pool`, the cells sharing the maximum weight (empty when the pool is empty). */
export function heaviestCells(pool: readonly Coord[], weights: Float64Array): Coord[] {
  let best: Coord[] = [];
  let bestWeight = -Infinity;
  for (const c of pool) {
    const w = weights[cellIndex(c)] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      best = [c];
    } else if (w === bestWeight) {
      best.push(c);
    }
  }
  return best;
}

/** Uniform integer in [0, n). Tolerates an rng that returns exactly 1 (or garbage) by clamping. */
export function randomIndex(rng: Rng, n: number): number {
  const i = Math.floor(rng() * n);
  if (!Number.isFinite(i)) return 0;
  return Math.min(n - 1, Math.max(0, i));
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomIndex(rng, items.length)];
}

/**
 * Last resort honouring the contract "an in-bounds, untried coordinate": any cell absent from `view.shots`.
 * Only reached when the analysis has no `unknown` cell left (an inconsistent view). Throws when the whole
 * board has been fired at, since no legal shot exists.
 */
export function fallbackShot(view: EnemyBoardView, rng: Rng): Coord {
  const tried = new Set(view.shots.map(coordKey));
  const candidates: Coord[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!tried.has(coordKey({ x, y }))) candidates.push({ x, y });
    }
  }
  const pick = pickRandom(candidates, rng);
  if (!pick) throw new Error('No untried cells left');
  return pick;
}

/** A uniformly random untried cell. */
export function randomUntried(a: ViewAnalysis, view: EnemyBoardView, rng: Rng): Coord {
  return pickRandom(a.untried, rng) ?? fallbackShot(view, rng);
}
