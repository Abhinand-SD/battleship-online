import type { AiDifficulty } from '../types';
import { createEasyAi } from './easy';
import { createHardAi } from './hard';
import { createMediumAi } from './medium';
import type { AiOpponent, AiOptions } from './types';

export * from './types';

/**
 * Creates the practice-mode opponent for a difficulty. Every opponent is a pure function of the
 * `EnemyBoardView` it is handed (plus the rng), so it never needs the hidden fleet and can be re-created
 * from a persisted game at any time. Pass a seeded `rng` for deterministic behaviour.
 *
 * - easy: random fire, follows up hits only half of the time, no parity.
 * - medium: hunt/target with checkerboard parity hunting and line extension.
 * - hard: probability-density targeting over all consistent placements of the remaining ships.
 */
export function createAi(difficulty: AiDifficulty, options: AiOptions = {}): AiOpponent {
  const rng = options.rng ?? Math.random;
  switch (difficulty) {
    case 'easy':
      return createEasyAi(rng);
    case 'medium':
      return createMediumAi(rng);
    case 'hard':
      return createHardAi(rng);
    default: {
      const unknown: never = difficulty;
      throw new Error(`Unknown AI difficulty: ${String(unknown)}`);
    }
  }
}
