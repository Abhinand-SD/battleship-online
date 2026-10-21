import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, SHIP_SPECS, SHIP_TYPES, TOTAL_SHIP_CELLS, coordKey, type ShipType } from '../src/constants';
import type { Coord, Fleet, Shot } from '../src/types';
import {
  createBoard,
  emptyEnemyView,
  emptyMyView,
  hasBeenAttacked,
  isAllSunk,
  receiveAttack,
  shipSize,
  shotGrid,
  toEnemyBoardView,
  toMyBoardView,
  type AttackResult,
  type BoardState,
} from '../src/engine/board';
import { shipCells } from '../src/engine/placement';

/** Every ship horizontal on its own even row, anchored at x = 0. */
const FLEET: Fleet = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 4, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 6, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 8, orientation: 'horizontal' },
];

const DESTROYER_CELLS: Coord[] = [
  { x: 0, y: 8 },
  { x: 1, y: 8 },
];
/** An empty-water cell. */
const MISS: Coord = { x: 9, y: 9 };

function cellsOf(...types: ShipType[]): Coord[] {
  return FLEET.filter((s) => types.includes(s.type)).flatMap(shipCells);
}

function cellsExcept(...types: ShipType[]): Coord[] {
  return FLEET.filter((s) => !types.includes(s.type)).flatMap(shipCells);
}

function fire(board: BoardState, coord: Coord): Extract<AttackResult, { ok: true }> {
  const result = receiveAttack(board, coord);
  if (!result.ok) throw new Error(`unexpected ${result.error} at ${coordKey(coord)}`);
  return result;
}

function fireAll(board: BoardState, coords: Coord[]): Extract<AttackResult, { ok: true }>[] {
  return coords.map((c) => fire(board, c));
}

/** The subset of `coords` whose `"x":X,"y":Y` JSON fragment appears anywhere in the serialised value. */
function coordsLeakedInto(value: unknown, coords: Coord[]): Coord[] {
  const json = JSON.stringify(value);
  return coords.filter((c) => json.includes(`"x":${c.x},"y":${c.y}`));
}

describe('createBoard', () => {
  it('builds one ShipState per ship with the right cells and no hits', () => {
    const board = createBoard(FLEET);
    expect(board.ships.map((s) => s.type)).toEqual([...SHIP_TYPES]);
    expect(board.ships.map((s) => s.cells.length)).toEqual(SHIP_TYPES.map((t) => SHIP_SPECS[t].size));
    expect(board.ships.every((s) => s.hits.length === s.cells.length && !s.hits.includes(true) && !s.sunk)).toBe(true);
    expect(board.shots.size).toBe(0);
    expect(board.shotLog).toEqual([]);
  });

  it('copies the fleet so later mutation of the input does not leak into the board', () => {
    const input = FLEET.map((s) => ({ ...s }));
    const board = createBoard(input);
    input[0]!.x = 5;
    expect(board.fleet[0]?.x).toBe(0);
    expect(board.fleet).toEqual(FLEET);
  });

  it('rejects invalid fleets with the validation reason', () => {
    expect(() => createBoard([])).toThrow(/exactly 5 ships/);
    expect(() => createBoard([...FLEET.slice(1), { type: 'battleship', x: 0, y: 0, orientation: 'vertical' }])).toThrow(/Duplicate ship/);
    expect(() => createBoard(FLEET.map((s) => (s.type === 'cruiser' ? { ...s, x: 1, y: 2 } : s)))).toThrow(/overlaps/);
    expect(() => createBoard(FLEET.map((s) => (s.type === 'carrier' ? { ...s, x: 6 } : s)))).toThrow(/outside the board/);
    expect(() => createBoard(null as unknown as Fleet)).toThrow(/array/);
  });
});

describe('receiveAttack', () => {
  it('records a miss on empty water', () => {
    const board = createBoard(FLEET);
    const result = receiveAttack(board, MISS);
    expect(result).toEqual({ ok: true, outcome: 'miss', allSunk: false });
    expect(board.shots.get(coordKey(MISS))).toBe('miss');
    expect(board.shotLog).toEqual([{ x: 9, y: 9, outcome: 'miss' }]);
    expect(hasBeenAttacked(board, MISS)).toBe(true);
    expect(hasBeenAttacked(board, { x: 0, y: 0 })).toBe(false);
  });

  it('records a hit on a ship that is not yet sunk', () => {
    const board = createBoard(FLEET);
    const result = fire(board, { x: 0, y: 8 });
    expect(result.outcome).toBe('hit');
    expect(result.allSunk).toBe(false);
    expect(result.ship?.type).toBe('destroyer');
    expect(result.ship?.sunk).toBe(false);
    expect(result.ship?.hits).toEqual([true, false]);
    expect(board.shots.get('0,8')).toBe('hit');
  });

  it('reports sunk on the last cell of a ship', () => {
    const board = createBoard(FLEET);
    fire(board, { x: 0, y: 8 });
    const result = fire(board, { x: 1, y: 8 });
    expect(result.outcome).toBe('sunk');
    expect(result.ship?.type).toBe('destroyer');
    expect(result.ship?.sunk).toBe(true);
    expect(result.allSunk).toBe(false);
    expect(board.shots.get('1,8')).toBe('sunk');
    expect(board.shotLog.map((s) => s.outcome)).toEqual(['hit', 'sunk']);
  });

  it('attributes hits to the right ship when several are damaged', () => {
    const board = createBoard(FLEET);
    const onCarrier = fire(board, { x: 0, y: 0 });
    const onBattleship = fire(board, { x: 0, y: 2 });
    expect(onCarrier.outcome).toBe('hit');
    expect(onBattleship.outcome).toBe('hit');
    expect(onCarrier.ship?.type).toBe('carrier');
    expect(onBattleship.ship?.type).toBe('battleship');
    expect(board.ships.filter((s) => s.hits.includes(true)).map((s) => s.type)).toEqual(['carrier', 'battleship']);
  });

  it('rejects out-of-bounds coordinates without touching the board', () => {
    const board = createBoard(FLEET);
    const bad: Coord[] = [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1.5, y: 2 },
      { x: Number.NaN, y: 0 },
    ];
    expect(bad.map((c) => receiveAttack(board, c))).toEqual(bad.map(() => ({ ok: false, error: 'OUT_OF_BOUNDS' })));
    expect(board.shotLog).toHaveLength(0);
    expect(board.shots.size).toBe(0);
  });

  it('rejects attacking the same water cell twice with no state change', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    expect(receiveAttack(board, MISS)).toEqual({ ok: false, error: 'ALREADY_ATTACKED' });
    expect(board.shotLog).toHaveLength(1);
    expect(board.shots.size).toBe(1);
  });

  it('rejects attacking the same ship cell twice and does not advance the ship towards sinking', () => {
    const board = createBoard(FLEET);
    fire(board, { x: 0, y: 8 });
    expect(receiveAttack(board, { x: 0, y: 8 })).toEqual({ ok: false, error: 'ALREADY_ATTACKED' });
    const destroyer = board.ships.find((s) => s.type === 'destroyer');
    expect(destroyer?.hits).toEqual([true, false]);
    expect(destroyer?.sunk).toBe(false);
    expect(board.shotLog).toHaveLength(1);
  });

  it('reports allSunk only once all 17 cells have been hit', () => {
    const board = createBoard(FLEET);
    const cells = FLEET.flatMap(shipCells);
    expect(cells).toHaveLength(TOTAL_SHIP_CELLS);
    const results = fireAll(board, cells);
    expect(results.slice(0, -1).some((r) => r.allSunk)).toBe(false);
    expect(results[results.length - 1]).toMatchObject({ ok: true, outcome: 'sunk', allSunk: true });
    expect(results.filter((r) => r.outcome === 'sunk')).toHaveLength(SHIP_TYPES.length);
    expect(results.filter((r) => r.outcome === 'hit')).toHaveLength(TOTAL_SHIP_CELLS - SHIP_TYPES.length);
  });

  it('misses in between do not affect sinking', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    fire(board, { x: 0, y: 8 });
    fire(board, { x: 8, y: 9 });
    expect(fire(board, { x: 1, y: 8 }).outcome).toBe('sunk');
    expect(board.shotLog.map((s) => s.outcome)).toEqual(['miss', 'hit', 'miss', 'sunk']);
  });
});

describe('isAllSunk', () => {
  it('stays false while any ship is afloat and flips once the last cell is hit', () => {
    const board = createBoard(FLEET);
    expect(isAllSunk(board)).toBe(false);
    fireAll(board, cellsExcept('destroyer'));
    expect(isAllSunk(board)).toBe(false);
    fire(board, { x: 0, y: 8 });
    expect(isAllSunk(board)).toBe(false);
    expect(fire(board, { x: 1, y: 8 }).allSunk).toBe(true);
    expect(isAllSunk(board)).toBe(true);
  });
});

describe('toMyBoardView', () => {
  it('shows the full fleet with zero hits before any shot', () => {
    const view = toMyBoardView(createBoard(FLEET));
    expect(view.fleet).toEqual(FLEET);
    expect(view.shots).toEqual([]);
    expect(view.sunk).toEqual([]);
    expect(view.hits).toEqual({ carrier: 0, battleship: 0, cruiser: 0, submarine: 0, destroyer: 0 });
  });

  it('tracks incoming shots in order, per-ship hit counts and sunk ships', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    fire(board, { x: 0, y: 8 });
    let view = toMyBoardView(board);
    expect(view.shots).toEqual([
      { x: 9, y: 9, outcome: 'miss' },
      { x: 0, y: 8, outcome: 'hit' },
    ]);
    expect(view.hits.destroyer).toBe(1);
    expect(view.sunk).toEqual([]);

    fire(board, { x: 1, y: 8 });
    view = toMyBoardView(board);
    expect(view.sunk).toEqual(['destroyer']);
    expect(view.hits.destroyer).toBe(2);
    expect(view.hits.carrier).toBe(0);
  });

  it('returns copies that cannot mutate the board', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    const view = toMyBoardView(board);
    view.fleet[0]!.x = 7;
    view.shots[0]!.outcome = 'sunk';
    view.sunk.push('carrier');
    expect(board.fleet[0]?.x).toBe(0);
    expect(board.shotLog[0]?.outcome).toBe('miss');
    expect(toMyBoardView(board).sunk).toEqual([]);
  });
});

describe('toEnemyBoardView', () => {
  it('exposes nothing about the fleet before any shot', () => {
    const view = toEnemyBoardView(createBoard(FLEET));
    expect(view).toEqual({ shots: [], sunkShips: [], remaining: [...SHIP_TYPES] });
    expect(Object.keys(view).sort()).toEqual(['remaining', 'shots', 'sunkShips']);
    expect(coordsLeakedInto(view, FLEET.flatMap(shipCells))).toEqual([]);
  });

  it('reveals a sunk ship with all of its cells and shrinks the remaining list', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    fireAll(board, DESTROYER_CELLS);
    const view = toEnemyBoardView(board);
    expect(view.sunkShips).toEqual([{ type: 'destroyer', cells: DESTROYER_CELLS }]);
    expect(view.remaining).toEqual(['carrier', 'battleship', 'cruiser', 'submarine']);
    expect(view.shots.map((s) => s.outcome)).toEqual(['miss', 'hit', 'sunk']);
  });

  it('never contains coordinates of unsunk ships', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    fire(board, { x: 8, y: 1 });
    fireAll(board, DESTROYER_CELLS);
    const view = toEnemyBoardView(board);
    expect(coordsLeakedInto(view, cellsExcept('destroyer'))).toEqual([]);
    expect(coordsLeakedInto(view, cellsOf('destroyer'))).toEqual(DESTROYER_CELLS);
  });

  it('a hit on an unsunk ship reveals only the cell that was shot', () => {
    const board = createBoard(FLEET);
    fire(board, { x: 2, y: 0 });
    const view = toEnemyBoardView(board);
    expect(view.sunkShips).toEqual([]);
    expect(view.remaining).toContain('carrier');
    expect(view.shots).toEqual([{ x: 2, y: 0, outcome: 'hit' }]);
    const otherCarrierCells = cellsOf('carrier').filter((c) => c.x !== 2);
    expect(coordsLeakedInto(view, otherCarrierCells)).toEqual([]);
  });

  it('remaining shrinks ship by ship until every ship is revealed', () => {
    const board = createBoard(FLEET);
    fireAll(board, cellsOf('destroyer'));
    expect(toEnemyBoardView(board).remaining).toHaveLength(4);
    fireAll(board, cellsOf('cruiser'));
    expect(toEnemyBoardView(board).remaining).toEqual(['carrier', 'battleship', 'submarine']);
    fireAll(board, cellsExcept('destroyer', 'cruiser'));
    const view = toEnemyBoardView(board);
    expect(view.remaining).toEqual([]);
    expect(view.sunkShips.map((s) => s.type)).toEqual([...SHIP_TYPES]);
    expect(view.sunkShips.flatMap((s) => s.cells)).toHaveLength(TOTAL_SHIP_CELLS);
  });

  it('returns copies of sunk ship cells and shots', () => {
    const board = createBoard(FLEET);
    fireAll(board, DESTROYER_CELLS);
    const view = toEnemyBoardView(board);
    view.sunkShips[0]!.cells[0]!.x = 9;
    view.shots[0]!.x = 9;
    expect(board.ships.find((s) => s.type === 'destroyer')?.cells[0]).toEqual({ x: 0, y: 8 });
    expect(board.shotLog[0]).toEqual({ x: 0, y: 8, outcome: 'hit' });
  });
});

describe('emptyEnemyView / emptyMyView', () => {
  it('emptyEnemyView lists every ship as remaining in a fresh array', () => {
    const view = emptyEnemyView();
    expect(view).toEqual({ shots: [], sunkShips: [], remaining: [...SHIP_TYPES] });
    view.remaining.pop();
    expect(emptyEnemyView().remaining).toHaveLength(SHIP_TYPES.length);
    expect(SHIP_TYPES).toHaveLength(5);
  });

  it('emptyMyView has no fleet, shots or hits', () => {
    expect(emptyMyView()).toEqual({ fleet: [], shots: [], sunk: [], hits: {} });
  });
});

describe('shotGrid', () => {
  it('starts as a 10x10 grid of nulls', () => {
    const grid = shotGrid([]);
    expect(grid).toHaveLength(BOARD_SIZE);
    expect(grid.every((row) => row.length === BOARD_SIZE && row.every((c) => c === null))).toBe(true);
  });

  it('indexes outcomes by [y][x]', () => {
    const shots: Shot[] = [
      { x: 3, y: 7, outcome: 'hit' },
      { x: 0, y: 0, outcome: 'miss' },
      { x: 9, y: 9, outcome: 'sunk' },
    ];
    const grid = shotGrid(shots);
    expect(grid[7]?.[3]).toBe('hit');
    expect(grid[3]?.[7]).toBeNull();
    expect(grid[0]?.[0]).toBe('miss');
    expect(grid[9]?.[9]).toBe('sunk');
    expect(grid.flat().filter((c) => c !== null)).toHaveLength(3);
  });

  it('ignores out-of-range shots and keeps every row exactly 10 wide', () => {
    const grid = shotGrid([
      { x: 10, y: 0, outcome: 'miss' },
      { x: 0, y: 10, outcome: 'miss' },
      { x: -1, y: 0, outcome: 'hit' },
      { x: 2.5, y: 2, outcome: 'hit' },
    ]);
    expect(grid.every((row) => row.length === BOARD_SIZE)).toBe(true);
    expect(grid.flat().every((c) => c === null)).toBe(true);
    expect(grid.every((row) => Object.keys(row).length === BOARD_SIZE)).toBe(true);
  });

  it('builds the same picture from a real board shot log', () => {
    const board = createBoard(FLEET);
    fire(board, MISS);
    fireAll(board, DESTROYER_CELLS);
    const grid = shotGrid(toEnemyBoardView(board).shots);
    expect(grid[9]?.[9]).toBe('miss');
    expect(grid[8]?.[0]).toBe('hit');
    expect(grid[8]?.[1]).toBe('sunk');
  });
});

describe('shipSize', () => {
  it('matches the ship specs', () => {
    expect(shipSize('carrier')).toBe(5);
    expect(shipSize('destroyer')).toBe(2);
    expect(SHIP_TYPES.map(shipSize)).toEqual(SHIP_TYPES.map((t) => SHIP_SPECS[t].size));
  });
});
