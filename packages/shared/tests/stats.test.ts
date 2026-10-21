import { describe, expect, it } from 'vitest';
import type { ShipType } from '../src/constants';
import type { Perspective, ShotOutcome, ShotRecord } from '../src/types';
import { computeMatchStats, eloDelta, eloExpected, formatDuration, roundPercent } from '../src/engine/stats';

/** Builds a plausible shot history; coordinates and timestamps are derived from the move number. */
function history(entries: [Perspective, ShotOutcome, ShipType?][]): ShotRecord[] {
  return entries.map(([by, outcome, sunk], i) => {
    const moveNumber = i + 1;
    const record: ShotRecord = { moveNumber, by, x: moveNumber % 10, y: Math.floor(moveNumber / 10) % 10, outcome, at: 1_700_000_000_000 + moveNumber * 1_000 };
    if (sunk) record.sunk = sunk;
    return record;
  });
}

const SAMPLE = history([
  ['me', 'hit'],
  ['opponent', 'miss'],
  ['me', 'sunk', 'destroyer'],
  ['opponent', 'sunk', 'destroyer'],
  ['me', 'miss'],
  ['opponent', 'hit'],
  ['opponent', 'sunk', 'cruiser'],
]);

describe('roundPercent', () => {
  it('rounds to one decimal place', () => {
    expect(roundPercent(66.666)).toBe(66.7);
    expect(roundPercent(12.34)).toBe(12.3);
    expect(roundPercent(12.36)).toBe(12.4);
    expect(roundPercent(100)).toBe(100);
    expect(roundPercent(0)).toBe(0);
  });
});

describe('computeMatchStats', () => {
  it('returns zeros (not NaN) for an empty history', () => {
    const zeros = { shots: 0, hits: 0, misses: 0, accuracy: 0, shipsSunk: 0, shipsLost: 0 };
    expect(computeMatchStats([], 'me')).toEqual(zeros);
    expect(computeMatchStats([], 'opponent')).toEqual(zeros);
  });

  it('computes each perspective from its own shots, with losses taken from the other side', () => {
    expect(computeMatchStats(SAMPLE, 'me')).toEqual({ shots: 3, hits: 2, misses: 1, accuracy: 66.7, shipsSunk: 1, shipsLost: 2 });
    expect(computeMatchStats(SAMPLE, 'opponent')).toEqual({ shots: 4, hits: 3, misses: 1, accuracy: 75, shipsSunk: 2, shipsLost: 1 });
  });

  it('the two perspectives mirror each other', () => {
    const me = computeMatchStats(SAMPLE, 'me');
    const opponent = computeMatchStats(SAMPLE, 'opponent');
    expect(me.shipsSunk).toBe(opponent.shipsLost);
    expect(me.shipsLost).toBe(opponent.shipsSunk);
    expect(me.shots + opponent.shots).toBe(SAMPLE.length);
  });

  it('counts a sinking shot as a hit', () => {
    const stats = computeMatchStats(history([['me', 'sunk', 'destroyer']]), 'me');
    expect(stats).toEqual({ shots: 1, hits: 1, misses: 0, accuracy: 100, shipsSunk: 1, shipsLost: 0 });
  });

  it('rounds accuracy to one decimal', () => {
    const accuracyOf = (hits: number, misses: number): number => {
      const entries: [Perspective, ShotOutcome][] = [
        ...Array.from({ length: hits }, (): [Perspective, ShotOutcome] => ['me', 'hit']),
        ...Array.from({ length: misses }, (): [Perspective, ShotOutcome] => ['me', 'miss']),
      ];
      return computeMatchStats(history(entries), 'me').accuracy;
    };
    expect(accuracyOf(1, 2)).toBe(33.3);
    expect(accuracyOf(2, 1)).toBe(66.7);
    expect(accuracyOf(1, 6)).toBe(14.3);
    expect(accuracyOf(5, 2)).toBe(71.4);
    expect(accuracyOf(1, 7)).toBe(12.5);
    expect(accuracyOf(3, 0)).toBe(100);
    expect(accuracyOf(0, 4)).toBe(0);
  });
});

describe('eloExpected', () => {
  it('is 0.5 for equal ratings and favours the higher rating', () => {
    expect(eloExpected(1000, 1000)).toBe(0.5);
    expect(eloExpected(1200, 1000)).toBeCloseTo(0.7597, 4);
    expect(eloExpected(1000, 1200)).toBeCloseTo(0.2403, 4);
  });

  it('expectations of the two players sum to 1', () => {
    for (const [a, b] of [
      [1000, 1000],
      [1500, 1000],
      [1000, 1731],
      [2200, 800],
    ] as const) {
      expect(eloExpected(a, b) + eloExpected(b, a)).toBeCloseTo(1, 10);
    }
  });
});

describe('eloDelta', () => {
  it('awards +/-16 between equals with the default K of 32, and 0 for a draw', () => {
    expect(eloDelta(1000, 1000, 1)).toBe(16);
    expect(eloDelta(1000, 1000, 0)).toBe(-16);
    expect(eloDelta(1000, 1000, 0.5)).toBe(0);
  });

  it('rewards upsets more than expected wins', () => {
    expect(eloDelta(1000, 1200, 1)).toBe(24);
    expect(eloDelta(1200, 1000, 1)).toBe(8);
    expect(eloDelta(1200, 1000, 0)).toBe(-24);
    expect(eloDelta(1000, 1200, 0)).toBe(-8);
  });

  it('rounds to whole points and saturates at 0 / K for huge gaps', () => {
    expect(eloDelta(2000, 1000, 1)).toBe(0);
    expect(eloDelta(1000, 2000, 1)).toBe(32);
    expect(eloDelta(2000, 1000, 0)).toBe(-32);
  });

  it('honours a custom K factor', () => {
    expect(eloDelta(1000, 1000, 1, 16)).toBe(8);
    expect(eloDelta(1000, 1000, 0, 40)).toBe(-20);
  });

  it('is an integer, bounded by K, and (up to rounding) zero-sum between the two players', () => {
    const ratings = [800, 1000, 1137, 1200, 1500, 1999, 2400];
    const deltas: number[] = [];
    const sums: number[] = [];
    for (const a of ratings) {
      for (const b of ratings) {
        const win = eloDelta(a, b, 1);
        const loss = eloDelta(b, a, 0);
        deltas.push(win, loss);
        sums.push(win + loss);
      }
    }
    expect(deltas.every(Number.isInteger)).toBe(true);
    expect(deltas.every((d) => Math.abs(d) <= 32)).toBe(true);
    expect(sums.every((s) => Math.abs(s) <= 1)).toBe(true);
    expect(eloDelta(1000, 1000, 1) + eloDelta(1000, 1000, 0)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats m:ss with zero-padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(1_000)).toBe('0:01');
    expect(formatDuration(61_000)).toBe('1:01');
    expect(formatDuration(90_500)).toBe('1:30');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('floors partial seconds and does not roll minutes into hours', () => {
    expect(formatDuration(999)).toBe('0:00');
    expect(formatDuration(59_999)).toBe('0:59');
    expect(formatDuration(3_600_000)).toBe('60:00');
    expect(formatDuration(3_725_000)).toBe('62:05');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});
