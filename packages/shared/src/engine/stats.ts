import type { MatchPlayerStats, Perspective, ShotRecord } from '../types';

export function roundPercent(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Computes per-player match statistics from the shot history. */
export function computeMatchStats(history: ShotRecord[], by: Perspective): MatchPlayerStats {
  const mine = history.filter((h) => h.by === by);
  const theirs = history.filter((h) => h.by !== by);
  const hits = mine.filter((h) => h.outcome !== 'miss').length;
  const shots = mine.length;
  return {
    shots,
    hits,
    misses: shots - hits,
    accuracy: shots === 0 ? 0 : roundPercent((hits / shots) * 100),
    shipsSunk: mine.filter((h) => h.outcome === 'sunk').length,
    shipsLost: theirs.filter((h) => h.outcome === 'sunk').length,
  };
}

/** Standard Elo expected score. */
export function eloExpected(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/** Returns the rating change for `rating` after a result (1 win, 0 loss, 0.5 draw). */
export function eloDelta(rating: number, opponentRating: number, score: 0 | 0.5 | 1, k = 32): number {
  return Math.round(k * (score - eloExpected(rating, opponentRating)));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
