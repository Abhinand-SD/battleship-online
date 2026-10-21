/**
 * Pure derivations for the Results screen. Side-effect free so they can be unit tested without React.
 */
import { ACHIEVEMENTS, type AchievementDef, type GameResult, type GameSnapshot, type MatchPlayerStats } from '@battleship/shared';

export type ResultKind = 'victory' | 'defeat' | 'draw';

export function resultKind(result: GameResult | null): ResultKind {
  if (result?.winner === 'me') return 'victory';
  if (result?.winner === 'opponent') return 'defeat';
  return 'draw';
}

/** Big word above the headline. */
export function resultTitle(result: GameResult | null): string {
  if (!result || result.reason === 'CANCELLED') return 'Match cancelled';
  switch (resultKind(result)) {
    case 'victory':
      return 'Victory';
    case 'defeat':
      return 'Defeat';
    default:
      return 'Draw';
  }
}

/** One-line explanation of how the match ended, from the viewing player's perspective. */
export function resultHeadline(result: GameResult | null): string {
  if (!result) return 'Match ended';
  const won = result.winner === 'me';
  const lost = result.winner === 'opponent';
  switch (result.reason) {
    case 'ALL_SUNK':
      return won ? 'Enemy fleet destroyed!' : lost ? 'Your fleet was sunk' : 'Both fleets went down';
    case 'FORFEIT':
      return won ? 'Opponent surrendered' : lost ? 'You surrendered' : 'Match forfeited';
    case 'TIMEOUT':
      return won ? 'Opponent ran out of time' : lost ? 'You ran out of time' : 'Time ran out';
    case 'ABANDONED':
      return won ? 'Opponent abandoned the match' : 'Match abandoned';
    case 'CANCELLED':
      return 'Match cancelled';
  }
}

/** "+12" / "-8" / "±0". */
export function formatRatingChange(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return `${change}`;
  return '±0';
}

export function unlockedAchievements(keys: readonly string[] | undefined): AchievementDef[] {
  if (!keys || keys.length === 0) return [];
  const set = new Set(keys);
  return ACHIEVEMENTS.filter((a) => set.has(a.key));
}

export interface StatRow {
  key: keyof MatchPlayerStats;
  label: string;
  me: string;
  opponent: string;
  /** Which column holds the better value, or null when equal / not comparable. */
  better: 'me' | 'opponent' | null;
  testId?: string;
}

function compare(me: number, opponent: number, higherIsBetter: boolean | null): StatRow['better'] {
  if (higherIsBetter === null || me === opponent) return null;
  return (me > opponent) === higherIsBetter ? 'me' : 'opponent';
}

/** Side-by-side comparison rows. `stat-hits` / `stat-ships-sunk` test ids live on the "me" cells. */
export function statRows(stats: GameResult['stats']): StatRow[] {
  const { me, opponent } = stats;
  const row = (key: keyof MatchPlayerStats, label: string, format: (n: number) => string, higherIsBetter: boolean | null, testId?: string): StatRow => ({
    key,
    label,
    me: format(me[key]),
    opponent: format(opponent[key]),
    better: compare(me[key], opponent[key], higherIsBetter),
    ...(testId ? { testId } : {}),
  });
  const num = (n: number) => String(n);
  const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
  return [
    row('shots', 'Shots fired', num, null),
    row('hits', 'Hits', num, true, 'stat-hits'),
    row('misses', 'Misses', num, false),
    row('accuracy', 'Accuracy', pct, true),
    row('shipsSunk', 'Ships sunk', num, true, 'stat-ships-sunk'),
    row('shipsLost', 'Ships lost', num, false),
  ];
}

export type RematchState =
  /** Online match, nobody asked yet. */
  | 'idle'
  /** I asked; waiting for the opponent. */
  | 'waiting'
  /** The opponent asked; I can accept. */
  | 'incoming'
  /** Against the AI: "Play again" starts immediately. */
  | 'practice'
  /** The opponent is gone; no rematch possible. */
  | 'unavailable';

export function rematchState(game: Pick<GameSnapshot, 'mode' | 'opponent' | 'rematch'>): RematchState {
  if (!game.opponent) return 'unavailable';
  if (game.mode === 'PRACTICE' || game.opponent.isAi) return game.rematch ? 'practice' : 'unavailable';
  if (!game.rematch) return 'unavailable';
  if (game.rematch.requestedByMe) return 'waiting';
  if (game.rematch.requestedByOpponent) return 'incoming';
  return 'idle';
}

/** Error code of a failed socket request, duck-typed so mocked modules work too. */
export function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}
