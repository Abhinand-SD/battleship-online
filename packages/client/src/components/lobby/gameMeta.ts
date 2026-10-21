import type { GameSnapshot } from '@battleship/shared';

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

/** Human readable mode label shown in the lobby / placement headers, e.g. "Practice · Hard AI". */
export function modeLabel(game: Pick<GameSnapshot, 'mode' | 'opponent'>): string {
  switch (game.mode) {
    case 'QUICK':
      return 'Quick match';
    case 'PRIVATE':
      return 'Private room';
    case 'PRACTICE': {
      const difficulty = game.opponent?.aiDifficulty;
      return difficulty ? `Practice · ${DIFFICULTY_LABELS[difficulty]} AI` : 'Practice';
    }
    default:
      return 'Match';
  }
}

/** Whole seconds left on a countdown, rounded up so "3…2…1…" reads naturally; null when there is no countdown. */
export function countdownSeconds(remainingMs: number | null): number | null {
  if (remainingMs == null) return null;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
