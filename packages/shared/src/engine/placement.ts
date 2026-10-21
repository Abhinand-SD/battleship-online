import { BOARD_SIZE, SHIP_SPECS, SHIP_TYPES, coordKey, type ShipType } from '../constants';
import type { Coord, Fleet, Orientation, ShipPlacement } from '../types';

export type Rng = () => number;

/** All cells occupied by a placement, in order from the anchor. */
export function shipCells(p: ShipPlacement): Coord[] {
  const size = SHIP_SPECS[p.type].size;
  const cells: Coord[] = [];
  for (let i = 0; i < size; i++) {
    cells.push(p.orientation === 'horizontal' ? { x: p.x + i, y: p.y } : { x: p.x, y: p.y + i });
  }
  return cells;
}

export function isInsideBoard(c: Coord): boolean {
  return Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < BOARD_SIZE && c.y < BOARD_SIZE;
}

export function placementInsideBoard(p: ShipPlacement): boolean {
  return shipCells(p).every(isInsideBoard);
}

export function placementsOverlap(a: ShipPlacement, b: ShipPlacement): boolean {
  const keys = new Set(shipCells(a).map(coordKey));
  return shipCells(b).some((c) => keys.has(coordKey(c)));
}

export type FleetValidation = { ok: true } | { ok: false; reason: string; ship?: ShipType };

/** Validates a full fleet: exactly one of each ship type, every ship inside the board, no overlaps. */
export function validateFleet(fleet: unknown): FleetValidation {
  if (!Array.isArray(fleet)) return { ok: false, reason: 'Fleet must be an array of ships.' };
  if (fleet.length !== SHIP_TYPES.length) {
    return { ok: false, reason: `Fleet must contain exactly ${SHIP_TYPES.length} ships.` };
  }
  const seen = new Set<ShipType>();
  const placements: ShipPlacement[] = [];
  for (const raw of fleet) {
    if (!isShipPlacement(raw)) return { ok: false, reason: 'Invalid ship placement.' };
    if (seen.has(raw.type)) return { ok: false, reason: `Duplicate ship: ${SHIP_SPECS[raw.type].name}.`, ship: raw.type };
    seen.add(raw.type);
    if (!placementInsideBoard(raw)) {
      return { ok: false, reason: `${SHIP_SPECS[raw.type].name} extends outside the board.`, ship: raw.type };
    }
    placements.push(raw);
  }
  for (const type of SHIP_TYPES) {
    if (!seen.has(type)) return { ok: false, reason: `Missing ship: ${SHIP_SPECS[type].name}.`, ship: type };
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]!;
      const b = placements[j]!;
      if (placementsOverlap(a, b)) {
        return { ok: false, reason: `${SHIP_SPECS[a.type].name} overlaps ${SHIP_SPECS[b.type].name}.`, ship: b.type };
      }
    }
  }
  return { ok: true };
}

export function isShipPlacement(v: unknown): v is ShipPlacement {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['type'] === 'string' &&
    (SHIP_TYPES as readonly string[]).includes(o['type']) &&
    typeof o['x'] === 'number' &&
    typeof o['y'] === 'number' &&
    (o['orientation'] === 'horizontal' || o['orientation'] === 'vertical')
  );
}

/**
 * Can `placement` be added to `fleet` (ignoring any existing ship of the same type, which is being moved)?
 * Returns true when the ship is inside the board and doesn't overlap another ship.
 */
export function canPlace(fleet: Fleet, placement: ShipPlacement): boolean {
  if (!placementInsideBoard(placement)) return false;
  return fleet.filter((s) => s.type !== placement.type).every((s) => !placementsOverlap(s, placement));
}

/** Returns the fleet with `placement` inserted/replaced, or null if it is illegal. */
export function placeShip(fleet: Fleet, placement: ShipPlacement): Fleet | null {
  if (!canPlace(fleet, placement)) return null;
  return [...fleet.filter((s) => s.type !== placement.type), placement];
}

export function removeShip(fleet: Fleet, type: ShipType): Fleet {
  return fleet.filter((s) => s.type !== type);
}

export function rotate(orientation: Orientation): Orientation {
  return orientation === 'horizontal' ? 'vertical' : 'horizontal';
}

/**
 * Rotates a ship around its anchor. If the rotated ship would leave the board it is shifted back
 * inside; returns null only if no legal rotated position exists (overlap).
 */
export function rotateShip(fleet: Fleet, type: ShipType): Fleet | null {
  const ship = fleet.find((s) => s.type === type);
  if (!ship) return null;
  const size = SHIP_SPECS[type].size;
  const orientation = rotate(ship.orientation);
  const candidate: ShipPlacement = { ...ship, orientation };
  if (orientation === 'horizontal') candidate.x = Math.min(ship.x, BOARD_SIZE - size);
  else candidate.y = Math.min(ship.y, BOARD_SIZE - size);
  return placeShip(fleet, candidate);
}

/** Generates a random valid fleet. Deterministic when given a seeded rng. */
export function randomFleet(rng: Rng = Math.random): Fleet {
  // Place the largest ships first; retry the whole fleet if we ever get stuck (extremely rare on 10x10).
  for (let attempt = 0; attempt < 100; attempt++) {
    let fleet: Fleet = [];
    let failed = false;
    for (const type of SHIP_TYPES) {
      const size = SHIP_SPECS[type].size;
      let placed = false;
      for (let tries = 0; tries < 200; tries++) {
        const orientation: Orientation = rng() < 0.5 ? 'horizontal' : 'vertical';
        const maxX = orientation === 'horizontal' ? BOARD_SIZE - size : BOARD_SIZE - 1;
        const maxY = orientation === 'vertical' ? BOARD_SIZE - size : BOARD_SIZE - 1;
        const candidate: ShipPlacement = {
          type,
          x: Math.floor(rng() * (maxX + 1)),
          y: Math.floor(rng() * (maxY + 1)),
          orientation,
        };
        const next = placeShip(fleet, candidate);
        if (next) {
          fleet = next;
          placed = true;
          break;
        }
      }
      if (!placed) {
        failed = true;
        break;
      }
    }
    if (!failed) return fleet;
  }
  throw new Error('Unable to generate a random fleet');
}

/** Returns a map of occupied cell -> ship type for quick lookups when rendering. */
export function fleetCellMap(fleet: Fleet): Map<string, ShipType> {
  const map = new Map<string, ShipType>();
  for (const ship of fleet) for (const c of shipCells(ship)) map.set(coordKey(c), ship.type);
  return map;
}
