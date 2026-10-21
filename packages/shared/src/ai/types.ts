import type { AiDifficulty, Coord, EnemyBoardView } from '../types';
import type { Rng } from '../engine/placement';

/**
 * An AI opponent only ever sees what a human would see: its own shots, sunk ships and remaining ship types.
 * It never has access to the hidden fleet. `chooseShot` must return an untried, in-bounds coordinate.
 */
export interface AiOpponent {
  readonly difficulty: AiDifficulty;
  chooseShot(view: EnemyBoardView): Coord;
}

export interface AiOptions {
  rng?: Rng;
}
