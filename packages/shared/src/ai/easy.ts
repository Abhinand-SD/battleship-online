import type { Rng } from '../engine/placement';
import type { Coord, EnemyBoardView } from '../types';
import type { AiOpponent } from './types';
import { analyzeView, cellsAdjacentToHits, pickRandom, randomUntried } from './util';

/** How often the easy AI bothers to follow up an unresolved hit. */
export const EASY_FOLLOW_UP_CHANCE = 0.5;

/**
 * Easy: fires at random untried cells (no parity). When it has an unresolved hit it follows up only half of
 * the time, and then simply picks a random untried orthogonal neighbour of one of its unresolved hits.
 */
export function chooseEasyShot(view: EnemyBoardView, rng: Rng): Coord {
  const analysis = analyzeView(view);
  if (analysis.unresolvedHits.length > 0 && rng() < EASY_FOLLOW_UP_CHANCE) {
    const followUp = pickRandom(cellsAdjacentToHits(analysis), rng);
    if (followUp) return followUp;
  }
  return randomUntried(analysis, view, rng);
}

export function createEasyAi(rng: Rng): AiOpponent {
  return {
    difficulty: 'easy',
    chooseShot: (view) => chooseEasyShot(view, rng),
  };
}
