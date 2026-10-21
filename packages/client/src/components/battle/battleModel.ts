/**
 * Pure derivations for the Battle and Results screens.
 *
 * Everything in this module is side-effect free and operates on the server snapshot only, so it can be
 * unit tested without React. Components call these helpers (usually through `useMemo`) and never derive
 * board state inline.
 */
import {
  SHIP_SPECS,
  SHIP_TYPES,
  coordKey,
  coordLabel,
  fleetCellMap,
  type Coord,
  type EnemyBoardView,
  type GameSnapshot,
  type MyBoardView,
  type Perspective,
  type ShipPlacement,
  type ShipType,
  type ShotOutcome,
  type ShotRecord,
  type SunkShip,
} from '@battleship/shared';
import type { CellState } from '../board/Cell';
import { formatRoomCode } from '../../lib/utils';

/** One-shot cell animation: which cell flashes, how, and a key that changes per shot so it animates once. */
export interface CellFlash {
  x: number;
  y: number;
  kind: 'hit' | 'miss';
  /** Move number of the shot; the cell is re-keyed on it so the animation runs exactly once per shot. */
  key: number;
}

export type PegTone = 'hit' | 'sunk';

/** A hit marker drawn above ship sprites (sprites would otherwise cover the cell's own hit styling). */
export interface Peg extends Coord {
  tone: PegTone;
}

export type TimerTone = 'normal' | 'warning' | 'danger';

export interface HistoryRow {
  moveNumber: number;
  by: Perspective;
  /** "You" / "Enemy". */
  actor: string;
  /** Human coordinate, e.g. "D7". */
  coord: string;
  outcome: ShotOutcome;
  /** Ship name when this shot sank something, otherwise null. */
  sunkName: string | null;
}

// ---------------------------------------------------------------------------
// Enemy board
// ---------------------------------------------------------------------------

/**
 * Lookup of every enemy cell that is no longer untried. Shots give `miss` / `hit`; the revealed cells of
 * sunk ships override to `sunk` (their earlier shots were recorded as plain hits).
 */
export function enemyCellMap(board: EnemyBoardView): Map<string, CellState> {
  const map = new Map<string, CellState>();
  for (const s of board.shots) map.set(coordKey(s), s.outcome === 'miss' ? 'miss' : s.outcome === 'sunk' ? 'sunk' : 'hit');
  for (const ship of board.sunkShips) for (const c of ship.cells) map.set(coordKey(c), 'sunk');
  return map;
}

/** Visual state of one enemy cell: `empty` (untried), `miss`, `hit` or `sunk`. */
export function cellStateFor(board: EnemyBoardView, x: number, y: number): CellState {
  return enemyCellMap(board).get(coordKey({ x, y })) ?? 'empty';
}

/** True when the cell has not been fired at yet. */
export function isUntried(board: EnemyBoardView, x: number, y: number): boolean {
  return cellStateFor(board, x, y) === 'empty';
}

/** Pegs for the enemy board: one per revealed sunk-ship cell (drawn over the sunk sprite). */
export function enemyPegs(board: EnemyBoardView): Peg[] {
  const pegs: Peg[] = [];
  for (const ship of board.sunkShips) for (const c of ship.cells) pegs.push({ x: c.x, y: c.y, tone: 'sunk' });
  return pegs;
}

/**
 * Converts a revealed sunk ship (a list of cells) back into a placement so it can be drawn with ShipSprite.
 * Returns null for an empty cell list.
 */
export function sunkShipPlacement(ship: SunkShip): ShipPlacement | null {
  const first = ship.cells[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  for (const c of ship.cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
  }
  const horizontal = ship.cells.every((c) => c.y === first.y);
  return { type: ship.type, x: minX, y: minY, orientation: horizontal ? 'horizontal' : 'vertical' };
}

// ---------------------------------------------------------------------------
// My board
// ---------------------------------------------------------------------------

/**
 * Lookup of my own cells: `ship` under an intact hull, `miss` / `hit` / `sunk` for incoming shots.
 * `fleetCells` is `fleetCellMap(board.fleet)`; pass it in so the component can memoise it.
 */
export function myCellMap(board: MyBoardView, fleetCells: Map<string, ShipType> = fleetCellMap(board.fleet)): Map<string, CellState> {
  const map = new Map<string, CellState>();
  for (const key of fleetCells.keys()) map.set(key, 'ship');
  for (const s of board.shots) {
    const key = coordKey(s);
    const type = fleetCells.get(key);
    if (s.outcome === 'miss' || !type) map.set(key, 'miss');
    else map.set(key, board.sunk.includes(type) ? 'sunk' : 'hit');
  }
  return map;
}

/** Visual state of one of my cells. */
export function myCellStateFor(board: MyBoardView, fleetCells: Map<string, ShipType>, x: number, y: number): CellState {
  return myCellMap(board, fleetCells).get(coordKey({ x, y })) ?? 'empty';
}

/** Pegs for my board: every incoming hit, toned `sunk` once the ship under it went down. */
export function myPegs(board: MyBoardView, fleetCells: Map<string, ShipType> = fleetCellMap(board.fleet)): Peg[] {
  const pegs: Peg[] = [];
  for (const s of board.shots) {
    if (s.outcome === 'miss') continue;
    const type = fleetCells.get(coordKey(s));
    if (!type) continue;
    pegs.push({ x: s.x, y: s.y, tone: board.sunk.includes(type) ? 'sunk' : 'hit' });
  }
  return pegs;
}

/** Number of my ships still afloat. */
export function shipsAfloat(board: MyBoardView): number {
  return SHIP_TYPES.length - board.sunk.length;
}

// ---------------------------------------------------------------------------
// Turn / firing
// ---------------------------------------------------------------------------

/** The most recent shot in the history (highest move number), or null before the first shot. */
export function latestShot(history: ShotRecord[]): ShotRecord | null {
  let latest: ShotRecord | null = null;
  for (const r of history) if (!latest || r.moveNumber > latest.moveNumber) latest = r;
  return latest;
}

/** Flash descriptor for the board owned by `by`'s target, or null when the latest shot was fired by the other side. */
export function shotFlash(record: ShotRecord | null, by: Perspective): CellFlash | null {
  if (!record || record.by !== by) return null;
  return { x: record.x, y: record.y, kind: record.outcome === 'miss' ? 'miss' : 'hit', key: record.moveNumber };
}

/** True when the local player may fire right now: battle running, my turn, no shot in flight. */
export function canFire(game: Pick<GameSnapshot, 'phase' | 'turn'>, pending: Coord | null | undefined): boolean {
  return game.phase === 'IN_BATTLE' && game.turn === 'me' && pending == null;
}

/** Colour tone of the turn timer: amber under 10s, red under 5s. */
export function timerTone(remainingMs: number | null): TimerTone {
  if (remainingMs == null) return 'normal';
  if (remainingMs < 5_000) return 'danger';
  if (remainingMs < 10_000) return 'warning';
  return 'normal';
}

export function turnLabel(turn: Perspective | null): string {
  if (turn === 'me') return 'Your turn — fire!';
  if (turn === 'opponent') return 'Enemy is aiming…';
  return 'Battle stations';
}

/** Banner text shown for a couple of seconds when the battle starts. */
export function firstTurnLabel(turn: Perspective | null): string | null {
  if (turn === 'me') return 'You fire first';
  if (turn === 'opponent') return 'Enemy fires first';
  return null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function outcomeLabel(outcome: ShotOutcome): string {
  return outcome === 'miss' ? 'Miss' : outcome === 'hit' ? 'Hit' : 'Sunk';
}

/** History rows for display, newest first. */
export function historyRows(history: ShotRecord[]): HistoryRow[] {
  return [...history]
    .sort((a, b) => b.moveNumber - a.moveNumber)
    .map((r) => ({
      moveNumber: r.moveNumber,
      by: r.by,
      actor: r.by === 'me' ? 'You' : 'Enemy',
      coord: coordLabel(r),
      outcome: r.outcome,
      sunkName: r.sunk ? SHIP_SPECS[r.sunk].name : null,
    }));
}

/** "You sunk their Battleship!" / "They sunk your Destroyer!"; null when the shot did not sink anything. */
export function sunkBannerText(record: ShotRecord | null): string | null {
  if (!record?.sunk) return null;
  const name = SHIP_SPECS[record.sunk].name;
  return record.by === 'me' ? `You sunk their ${name}!` : `They sunk your ${name}!`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Quick Match" / "Private · ABC-DEF" / "Practice · Hard". */
export function modeLabel(game: Pick<GameSnapshot, 'mode' | 'roomCode' | 'opponent'>): string {
  switch (game.mode) {
    case 'QUICK':
      return 'Quick Match';
    case 'PRIVATE':
      return game.roomCode ? `Private · ${formatRoomCode(game.roomCode)}` : 'Private';
    case 'PRACTICE': {
      const difficulty = game.opponent?.aiDifficulty;
      return difficulty ? `Practice · ${capitalize(difficulty)}` : 'Practice';
    }
  }
}

export function opponentName(game: Pick<GameSnapshot, 'opponent'>): string {
  return game.opponent?.displayName ?? 'Opponent';
}

/** Short description of an AI opponent, e.g. "Hard AI". */
export function aiLabel(difficulty: string | undefined): string {
  return difficulty ? `${capitalize(difficulty)} AI` : 'AI';
}

/** Screen-reader text for a cell. */
export function cellDescription(label: string, state: CellState, fireable: boolean): string {
  switch (state) {
    case 'miss':
      return `${label}: miss`;
    case 'hit':
      return `${label}: hit`;
    case 'sunk':
      return `${label}: sunk ship`;
    case 'ship':
      return `${label}: your ship`;
    case 'aim':
      return `${label}: aimed, activate again to fire`;
    default:
      return fireable ? `${label}: untried, activate to fire` : `${label}: untried`;
  }
}
