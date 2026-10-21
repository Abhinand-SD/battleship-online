import type { Rng } from '../engine/placement';
import type { Coord, EnemyBoardView } from '../types';
import type { AiOpponent } from './types';
import { analyzeView, cellsAdjacentToHits, heaviestCells, pickRandom, placementDensity, randomUntried } from './util';

/** Weight multiplier per unresolved hit a placement covers: `1 + HARD_HIT_BONUS * hitsCovered`. */
export const HARD_HIT_BONUS = 5;

/**
 * Hard: probability-density targeting.
 * Every placement of every remaining ship that is consistent with the view (no miss, no sunk cell) adds weight
 * to the untried cells it covers; placements covering unresolved hits weigh `1 + 5 * hitsCovered`. The shot is
 * the heaviest untried cell (ties broken with the rng). While unresolved hits exist only cells orthogonally
 * adjacent to them (which includes the cells along a line of hits) are considered, unless none is available.
 * A cell no remaining ship can occupy has weight 0 and is therefore never chosen while a live cell exists.
 */
export function chooseHardShot(view: EnemyBoardView, rng: Rng): Coord {
  const analysis = analyzeView(view);
  const weights = placementDensity(analysis, HARD_HIT_BONUS);

  let pool: Coord[] = analysis.unresolvedHits.length > 0 ? cellsAdjacentToHits(analysis) : [];
  if (pool.length === 0) pool = analysis.untried;

  return pickRandom(heaviestCells(pool, weights), rng) ?? randomUntried(analysis, view, rng);
}

export function createHardAi(rng: Rng): AiOpponent {
  return {
    difficulty: 'hard',
    chooseShot: (view) => chooseHardShot(view, rng),
  };
}
