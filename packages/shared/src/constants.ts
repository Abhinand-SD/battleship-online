/** Board is always BOARD_SIZE x BOARD_SIZE. x = column (0..9, A..J), y = row (0..9, 1..10). */
export const BOARD_SIZE = 10;

export const SHIP_TYPES = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] as const;
export type ShipType = (typeof SHIP_TYPES)[number];

export interface ShipSpec {
  type: ShipType;
  name: string;
  size: number;
}

export const SHIP_SPECS: Record<ShipType, ShipSpec> = {
  carrier: { type: 'carrier', name: 'Carrier', size: 5 },
  battleship: { type: 'battleship', name: 'Battleship', size: 4 },
  cruiser: { type: 'cruiser', name: 'Cruiser', size: 3 },
  submarine: { type: 'submarine', name: 'Submarine', size: 3 },
  destroyer: { type: 'destroyer', name: 'Destroyer', size: 2 },
};

/** Sum of all ship sizes: 5 + 4 + 3 + 3 + 2. */
export const TOTAL_SHIP_CELLS = 17;

export const COLUMN_LABELS = 'ABCDEFGHIJ';

/** Human readable coordinate, e.g. {x:0,y:0} -> "A1", {x:9,y:9} -> "J10". */
export function coordLabel(c: { x: number; y: number }): string {
  return `${COLUMN_LABELS[c.x] ?? '?'}${c.y + 1}`;
}

/** Stable string key for a coordinate, used in maps/sets. */
export function coordKey(c: { x: number; y: number }): string {
  return `${c.x},${c.y}`;
}

export function parseCoordKey(key: string): { x: number; y: number } {
  const [xs, ys] = key.split(',');
  return { x: Number(xs), y: Number(ys) };
}

/** Alphabet for private room codes: no 0/O/1/I to avoid ambiguity. 32 symbols, 6 chars => 2^30 combinations. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** Default server timings (ms). The server may override these via environment variables. */
export const DEFAULT_TIMINGS = {
  /** Lobby countdown once both players are ready. */
  lobbyCountdownMs: 3_000,
  /** READY -> IN_BATTLE countdown once both fleets are confirmed. */
  battleCountdownMs: 3_000,
  /** Time a player has to fire a shot. On expiry the turn is skipped. */
  turnTimeoutMs: 45_000,
  /** Consecutive skipped turns before a player forfeits. */
  maxConsecutiveTimeouts: 3,
  /** Time a disconnected player has to reconnect before forfeiting an active match. */
  reconnectGraceMs: 60_000,
  /** Time a player has to place ships before the match is abandoned. */
  placementTimeoutMs: 180_000,
  /** Artificial thinking delay for the AI opponent. */
  aiMoveDelayMs: 900,
} as const;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;

/** Built-in avatar identifiers. The client renders an SVG for each key. */
export const AVATAR_IDS = [
  'anchor',
  'compass',
  'helm',
  'lighthouse',
  'kraken',
  'submarine',
  'radar',
  'torpedo',
  'wave',
  'shark',
  'skull',
  'star',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
}

/** Achievements unlocked by match results. Keys are persisted; keep them stable. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: 'first_victory', name: 'First Victory', description: 'Win your first online match.' },
  { key: 'sharpshooter', name: 'Sharpshooter', description: 'Win a match with at least 60% accuracy.' },
  { key: 'flawless', name: 'Flawless', description: 'Win a match without losing a single ship.' },
  { key: 'comeback', name: 'Comeback', description: 'Win a match after losing four ships.' },
  { key: 'hot_streak', name: 'Hot Streak', description: 'Win three online matches in a row.' },
  { key: 'veteran', name: 'Veteran', description: 'Play 25 matches.' },
  { key: 'admiral', name: 'Admiral', description: 'Beat the Hard AI in practice mode.' },
] as const;
