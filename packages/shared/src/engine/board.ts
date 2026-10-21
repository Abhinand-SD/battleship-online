import { BOARD_SIZE, SHIP_SPECS, SHIP_TYPES, coordKey, type ShipType } from '../constants';
import type { Coord, EnemyBoardView, Fleet, MyBoardView, Shot, ShotOutcome, SunkShip } from '../types';
import { isInsideBoard, shipCells, validateFleet } from './placement';

/** Server-side state of one ship. */
export interface ShipState {
  type: ShipType;
  cells: Coord[];
  /** Parallel to `cells`: whether each cell has been hit. */
  hits: boolean[];
  sunk: boolean;
}

/** Server-side authoritative state of one player's board. Never send this to the opponent. */
export interface BoardState {
  fleet: Fleet;
  ships: ShipState[];
  /** Incoming shots keyed by "x,y". */
  shots: Map<string, ShotOutcome>;
  /** Ordered list of incoming shots. */
  shotLog: Shot[];
}

export function createBoard(fleet: Fleet): BoardState {
  const validation = validateFleet(fleet);
  if (!validation.ok) throw new Error(validation.reason);
  return {
    fleet: fleet.map((s) => ({ ...s })),
    ships: fleet.map((p) => ({ type: p.type, cells: shipCells(p), hits: shipCells(p).map(() => false), sunk: false })),
    shots: new Map(),
    shotLog: [],
  };
}

export type AttackResult =
  | { ok: true; outcome: ShotOutcome; ship?: ShipState; allSunk: boolean }
  | { ok: false; error: 'OUT_OF_BOUNDS' | 'ALREADY_ATTACKED' };

/** Resolves a shot against the board, mutating it. */
export function receiveAttack(board: BoardState, coord: Coord): AttackResult {
  if (!isInsideBoard(coord)) return { ok: false, error: 'OUT_OF_BOUNDS' };
  const key = coordKey(coord);
  if (board.shots.has(key)) return { ok: false, error: 'ALREADY_ATTACKED' };

  for (const ship of board.ships) {
    const idx = ship.cells.findIndex((c) => c.x === coord.x && c.y === coord.y);
    if (idx === -1) continue;
    ship.hits[idx] = true;
    ship.sunk = ship.hits.every(Boolean);
    const outcome: ShotOutcome = ship.sunk ? 'sunk' : 'hit';
    board.shots.set(key, outcome);
    board.shotLog.push({ x: coord.x, y: coord.y, outcome });
    return { ok: true, outcome, ship, allSunk: isAllSunk(board) };
  }
  board.shots.set(key, 'miss');
  board.shotLog.push({ x: coord.x, y: coord.y, outcome: 'miss' });
  return { ok: true, outcome: 'miss', allSunk: false };
}

export function isAllSunk(board: BoardState): boolean {
  return board.ships.every((s) => s.sunk);
}

export function hasBeenAttacked(board: BoardState, coord: Coord): boolean {
  return board.shots.has(coordKey(coord));
}

/** What the owner of the board sees. */
export function toMyBoardView(board: BoardState): MyBoardView {
  const hits: Partial<Record<ShipType, number>> = {};
  for (const ship of board.ships) hits[ship.type] = ship.hits.filter(Boolean).length;
  return {
    fleet: board.fleet.map((s) => ({ ...s })),
    shots: board.shotLog.map((s) => ({ ...s })),
    sunk: board.ships.filter((s) => s.sunk).map((s) => s.type),
    hits,
  };
}

/** What the opponent sees: only shots and sunk ships. Unsunk ship positions are never included. */
export function toEnemyBoardView(board: BoardState): EnemyBoardView {
  const sunkShips: SunkShip[] = board.ships
    .filter((s) => s.sunk)
    .map((s) => ({ type: s.type, cells: s.cells.map((c) => ({ ...c })) }));
  return {
    shots: board.shotLog.map((s) => ({ ...s })),
    sunkShips,
    remaining: board.ships.filter((s) => !s.sunk).map((s) => s.type),
  };
}

/** An empty enemy view (used before the opponent has confirmed a fleet). */
export function emptyEnemyView(): EnemyBoardView {
  return { shots: [], sunkShips: [], remaining: [...SHIP_TYPES] };
}

export function emptyMyView(): MyBoardView {
  return { fleet: [], shots: [], sunk: [], hits: {} };
}

/** Builds a 10x10 lookup of shot outcomes from a shot list. */
export function shotGrid(shots: Shot[]): (ShotOutcome | null)[][] {
  const grid: (ShotOutcome | null)[][] = Array.from({ length: BOARD_SIZE }, () => Array<ShotOutcome | null>(BOARD_SIZE).fill(null));
  for (const s of shots) {
    if (!isInsideBoard(s)) continue;
    const row = grid[s.y];
    if (row) row[s.x] = s.outcome;
  }
  return grid;
}

export function shipSize(type: ShipType): number {
  return SHIP_SPECS[type].size;
}
