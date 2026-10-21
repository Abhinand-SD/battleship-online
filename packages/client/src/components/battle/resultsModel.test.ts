import { describe, expect, it } from 'vitest';
import type { GameResult } from '@battleship/shared';
import { formatRatingChange, rematchState, resultHeadline, resultKind, resultTitle, statRows, unlockedAchievements } from './resultsModel';

const stats: GameResult['stats'] = {
  me: { shots: 40, hits: 17, misses: 23, accuracy: 42.5, shipsSunk: 5, shipsLost: 2 },
  opponent: { shots: 39, hits: 9, misses: 30, accuracy: 23, shipsSunk: 2, shipsLost: 5 },
};

function result(overrides: Partial<GameResult>): GameResult {
  return { winner: 'me', reason: 'ALL_SUNK', durationMs: 1000, stats, ...overrides };
}

describe('resultsModel', () => {
  it('maps the winner to a result kind', () => {
    expect(resultKind(result({ winner: 'me' }))).toBe('victory');
    expect(resultKind(result({ winner: 'opponent' }))).toBe('defeat');
    expect(resultKind(result({ winner: null }))).toBe('draw');
    expect(resultKind(null)).toBe('draw');
  });

  it('writes the headline from the end reason and perspective', () => {
    expect(resultHeadline(result({ winner: 'me', reason: 'ALL_SUNK' }))).toBe('Enemy fleet destroyed!');
    expect(resultHeadline(result({ winner: 'opponent', reason: 'ALL_SUNK' }))).toBe('Your fleet was sunk');
    expect(resultHeadline(result({ winner: 'me', reason: 'FORFEIT' }))).toBe('Opponent surrendered');
    expect(resultHeadline(result({ winner: 'opponent', reason: 'FORFEIT' }))).toBe('You surrendered');
    expect(resultHeadline(result({ winner: 'me', reason: 'TIMEOUT' }))).toBe('Opponent ran out of time');
    expect(resultHeadline(result({ winner: 'opponent', reason: 'TIMEOUT' }))).toBe('You ran out of time');
    expect(resultHeadline(result({ winner: 'me', reason: 'ABANDONED' }))).toBe('Opponent abandoned the match');
    expect(resultHeadline(result({ winner: null, reason: 'ABANDONED' }))).toBe('Match abandoned');
    expect(resultHeadline(result({ winner: null, reason: 'CANCELLED' }))).toBe('Match cancelled');
    expect(resultTitle(result({ winner: null, reason: 'CANCELLED' }))).toBe('Match cancelled');
    expect(resultTitle(result({ winner: 'me' }))).toBe('Victory');
  });

  it('formats rating changes with a sign', () => {
    expect(formatRatingChange(12)).toBe('+12');
    expect(formatRatingChange(-8)).toBe('-8');
    expect(formatRatingChange(0)).toBe('±0');
  });

  it('resolves achievement keys and ignores unknown ones', () => {
    expect(unlockedAchievements(['flawless', 'nope']).map((a) => a.name)).toEqual(['Flawless']);
    expect(unlockedAchievements(undefined)).toEqual([]);
  });

  it('builds comparison rows with the better side marked', () => {
    const rows = statRows(stats);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey['hits']).toMatchObject({ me: '17', opponent: '9', better: 'me', testId: 'stat-hits' });
    expect(byKey['misses']).toMatchObject({ better: 'me' });
    expect(byKey['shipsLost']).toMatchObject({ better: 'me' });
    expect(byKey['accuracy']).toMatchObject({ me: '42.5%', opponent: '23%' });
    expect(byKey['shots']?.better).toBeNull();
    expect(byKey['shipsSunk']?.testId).toBe('stat-ships-sunk');
  });

  it('derives the rematch state from the snapshot', () => {
    const human = { id: 'o', displayName: 'O', avatar: 'anchor', isGuest: true, isAi: false, rating: 1000, connected: true, ready: false, fleetConfirmed: true };
    const ai = { ...human, isAi: true as const, aiDifficulty: 'hard' as const };
    expect(rematchState({ mode: 'QUICK', opponent: human, rematch: { requestedByMe: false, requestedByOpponent: false } })).toBe('idle');
    expect(rematchState({ mode: 'QUICK', opponent: human, rematch: { requestedByMe: true, requestedByOpponent: false } })).toBe('waiting');
    expect(rematchState({ mode: 'QUICK', opponent: human, rematch: { requestedByMe: false, requestedByOpponent: true } })).toBe('incoming');
    expect(rematchState({ mode: 'PRIVATE', opponent: human, rematch: null })).toBe('unavailable');
    expect(rematchState({ mode: 'QUICK', opponent: null, rematch: null })).toBe('unavailable');
    expect(rematchState({ mode: 'PRACTICE', opponent: ai, rematch: { requestedByMe: false, requestedByOpponent: false } })).toBe('practice');
  });
});
