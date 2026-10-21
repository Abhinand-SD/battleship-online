import type { EndReason, GameMode } from '@battleship/shared';
import { formatClock } from '../../lib/utils';

export const MODE_LABELS: Record<GameMode, string> = {
  QUICK: 'Quick match',
  PRIVATE: 'Private room',
  PRACTICE: 'Practice',
};

export const MODE_SHORT_LABELS: Record<GameMode, string> = {
  QUICK: 'Quick',
  PRIVATE: 'Private',
  PRACTICE: 'Practice',
};

/** End-of-match reason phrased from the viewing player's perspective. */
export function endReasonLabel(reason: EndReason, won: boolean): string {
  switch (reason) {
    case 'ALL_SUNK':
      return won ? 'Sank the whole fleet' : 'Fleet sunk';
    case 'FORFEIT':
      return won ? 'Opponent surrendered' : 'Surrendered';
    case 'TIMEOUT':
      return won ? 'Opponent timed out' : 'Timed out';
    case 'ABANDONED':
      return won ? 'Opponent left' : 'Left the match';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return reason;
  }
}

/** Percent with no decimals for whole numbers, one decimal otherwise ("64%", "33.3%"). */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Signed integer with an explicit plus sign ("+12", "-8", "0"). */
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

/** Match duration as m:ss, falling back to hours when a match ran long. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const rest = totalSeconds % 3600;
    return `${h}h ${formatClock(rest * 1000)}`;
  }
  return formatClock(totalSeconds * 1000);
}

export function formatRank(rank: number | null | undefined): string {
  return rank == null ? 'Unranked' : `#${rank.toLocaleString()}`;
}
