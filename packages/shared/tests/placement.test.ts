import { describe, expect, it } from 'vitest';
import {
  SHIP_SPECS,
  SHIP_TYPES,
  TOTAL_SHIP_CELLS,
  coordKey,
  coordLabel,
  parseCoordKey,
  type ShipType,
} from '../src/constants';
import type { Fleet, Orientation, ShipPlacement } from '../src/types';
import {
  canPlace,
  fleetCellMap,
  isInsideBoard,
  isShipPlacement,
  placeShip,
  placementInsideBoard,
  placementsOverlap,
  randomFleet,
  removeShip,
  rotate,
  rotateShip,
  shipCells,
  validateFleet,
  type FleetValidation,
  type Rng,
} from '../src/engine/placement';

/** Tiny deterministic LCG (Numerical Recipes constants). Returns values in [0, 1). */
function makeLcg(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Known-valid fleet: every ship horizontal on its own even row, anchored at x = 0. */
const VALID_FLEET: Fleet = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 4, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 6, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 8, orientation: 'horizontal' },
];

/** Copy of `fleet` with the ship of `replacement.type` swapped for `replacement`. */
function withShip(fleet: Fleet, replacement: ShipPlacement): Fleet {
  return fleet.map((s) => (s.type === replacement.type ? replacement : s));
}

function without(fleet: Fleet, type: ShipType): Fleet {
  return fleet.filter((s) => s.type !== type);
}

function findShip(fleet: Fleet, type: ShipType): ShipPlacement {
  const ship = fleet.find((s) => s.type === type);
  if (!ship) throw new Error(`fleet has no ${type}`);
  return ship;
}

function rejection(fleet: unknown): Extract<FleetValidation, { ok: false }> {
  const v = validateFleet(fleet);
  if (v.ok) throw new Error('expected the fleet to be rejected');
  return v;
}

function mustPlace(fleet: Fleet, placement: ShipPlacement): Fleet {
  const next = placeShip(fleet, placement);
  if (!next) throw new Error(`could not place ${placement.type} at ${coordKey(placement)}`);
  return next;
}

function mustRotate(fleet: Fleet, type: ShipType): Fleet {
  const next = rotateShip(fleet, type);
  if (!next) throw new Error(`could not rotate ${type}`);
  return next;
}

describe('shipCells', () => {
  it('extends to the right for horizontal ships, starting at the anchor', () => {
    expect(shipCells({ type: 'carrier', x: 2, y: 3, orientation: 'horizontal' })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 6, y: 3 },
    ]);
  });

  it('extends downwards for vertical ships', () => {
    expect(shipCells({ type: 'destroyer', x: 7, y: 8, orientation: 'vertical' })).toEqual([
      { x: 7, y: 8 },
      { x: 7, y: 9 },
    ]);
  });

  it('yields exactly `size` cells for every ship type', () => {
    const sizes = SHIP_TYPES.map((type) => shipCells({ type, x: 0, y: 0, orientation: 'vertical' }).length);
    expect(sizes).toEqual(SHIP_TYPES.map((type) => SHIP_SPECS[type].size));
  });
});

describe('isInsideBoard / placementInsideBoard', () => {
  it('accepts every corner and rejects coordinates past the edge or non-integers', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 0, y: 9 },
      { x: 9, y: 9 },
    ];
    const outside = [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1.5, y: 0 },
      { x: Number.NaN, y: 0 },
    ];
    expect(corners.every(isInsideBoard)).toBe(true);
    expect(outside.some(isInsideBoard)).toBe(false);
  });

  it('allows a horizontal carrier at x=5 but not at x=6', () => {
    expect(placementInsideBoard({ type: 'carrier', x: 5, y: 0, orientation: 'horizontal' })).toBe(true);
    expect(placementInsideBoard({ type: 'carrier', x: 6, y: 0, orientation: 'horizontal' })).toBe(false);
  });

  it('allows a vertical carrier at y=5 but not at y=6', () => {
    expect(placementInsideBoard({ type: 'carrier', x: 9, y: 5, orientation: 'vertical' })).toBe(true);
    expect(placementInsideBoard({ type: 'carrier', x: 9, y: 6, orientation: 'vertical' })).toBe(false);
  });

  it('checks the far edge for the smallest ship too', () => {
    expect(placementInsideBoard({ type: 'destroyer', x: 8, y: 9, orientation: 'horizontal' })).toBe(true);
    expect(placementInsideBoard({ type: 'destroyer', x: 9, y: 9, orientation: 'horizontal' })).toBe(false);
    expect(placementInsideBoard({ type: 'destroyer', x: 9, y: 8, orientation: 'vertical' })).toBe(true);
    expect(placementInsideBoard({ type: 'destroyer', x: 9, y: 9, orientation: 'vertical' })).toBe(false);
  });
});

describe('placementsOverlap', () => {
  it('detects crossing ships in either argument order', () => {
    const carrier: ShipPlacement = { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' };
    const cruiser: ShipPlacement = { type: 'cruiser', x: 2, y: 0, orientation: 'vertical' };
    expect(placementsOverlap(carrier, cruiser)).toBe(true);
    expect(placementsOverlap(cruiser, carrier)).toBe(true);
  });

  it('does not treat touching ships as overlapping', () => {
    const cruiser: ShipPlacement = { type: 'cruiser', x: 0, y: 0, orientation: 'horizontal' };
    const submarine: ShipPlacement = { type: 'submarine', x: 3, y: 0, orientation: 'horizontal' };
    const destroyer: ShipPlacement = { type: 'destroyer', x: 0, y: 1, orientation: 'horizontal' };
    expect(placementsOverlap(cruiser, submarine)).toBe(false);
    expect(placementsOverlap(cruiser, destroyer)).toBe(false);
  });
});

describe('validateFleet', () => {
  it('accepts a valid fleet', () => {
    expect(validateFleet(VALID_FLEET)).toEqual({ ok: true });
  });

  it('rejects the wrong number of ships', () => {
    const extra: ShipPlacement = { type: 'destroyer', x: 5, y: 8, orientation: 'horizontal' };
    expect(rejection(VALID_FLEET.slice(0, 4)).reason).toMatch(/exactly 5 ships/);
    expect(rejection([...VALID_FLEET, extra]).reason).toMatch(/exactly 5 ships/);
    expect(rejection([]).reason).toMatch(/exactly 5 ships/);
  });

  it('rejects a duplicated ship type and names the ship', () => {
    const twoDestroyers: Fleet = [...without(VALID_FLEET, 'carrier'), { type: 'destroyer', x: 5, y: 8, orientation: 'horizontal' }];
    const v = rejection(twoDestroyers);
    expect(v.reason).toBe('Duplicate ship: Destroyer.');
    expect(v.ship).toBe('destroyer');
  });

  it('rejects a fleet that is missing a ship type', () => {
    // With the count enforced, a 5-entry fleet lacking one type necessarily duplicates another,
    // and a shorter fleet fails the count check; either way the fleet must be rejected.
    const noCarrier = without(VALID_FLEET, 'carrier');
    expect(validateFleet(noCarrier).ok).toBe(false);
    expect(validateFleet([...noCarrier, { type: 'submarine', x: 5, y: 6, orientation: 'horizontal' }]).ok).toBe(false);
    expect(SHIP_TYPES.every((type) => !validateFleet(without(VALID_FLEET, type)).ok)).toBe(true);
  });

  it('rejects a ship that extends outside the board and names it', () => {
    const v = rejection(withShip(VALID_FLEET, { type: 'carrier', x: 6, y: 0, orientation: 'horizontal' }));
    expect(v.reason).toBe('Carrier extends outside the board.');
    expect(v.ship).toBe('carrier');
    const vertical = rejection(withShip(VALID_FLEET, { type: 'destroyer', x: 0, y: 9, orientation: 'vertical' }));
    expect(vertical.reason).toMatch(/Destroyer extends outside the board/);
  });

  it('rejects non-integer or negative coordinates', () => {
    expect(validateFleet(withShip(VALID_FLEET, { type: 'cruiser', x: 0.5, y: 4, orientation: 'horizontal' })).ok).toBe(false);
    expect(validateFleet(withShip(VALID_FLEET, { type: 'cruiser', x: -1, y: 4, orientation: 'horizontal' })).ok).toBe(false);
  });

  it('rejects overlapping ships and names both of them', () => {
    const v = rejection(withShip(VALID_FLEET, { type: 'battleship', x: 0, y: 0, orientation: 'vertical' }));
    expect(v.reason).toBe('Carrier overlaps Battleship.');
    expect(v.reason).toContain(SHIP_SPECS.carrier.name);
    expect(v.reason).toContain(SHIP_SPECS.battleship.name);
    expect(v.ship).toBe('battleship');
  });

  it('reports overlaps between any pair, not only neighbours in the list', () => {
    // The destroyer (last entry) crossing the carrier (first entry).
    const v = rejection(withShip(VALID_FLEET, { type: 'destroyer', x: 4, y: 0, orientation: 'vertical' }));
    expect(v.reason).toBe('Carrier overlaps Destroyer.');
    expect(v.ship).toBe('destroyer');
  });

  it('rejects entries that are not ship placements', () => {
    const carrier = findShip(VALID_FLEET, 'carrier');
    const rest = without(VALID_FLEET, 'carrier');
    expect(rejection([1, 2, 3, 4, 5]).reason).toBe('Invalid ship placement.');
    expect(rejection([null, ...rest]).reason).toBe('Invalid ship placement.');
    expect(rejection(['carrier', ...rest]).reason).toBe('Invalid ship placement.');
    expect(rejection([{ ...carrier, type: 'frigate' }, ...rest]).reason).toBe('Invalid ship placement.');
    expect(rejection([{ ...carrier, orientation: 'diagonal' }, ...rest]).reason).toBe('Invalid ship placement.');
    expect(rejection([{ ...carrier, x: '0' }, ...rest]).reason).toBe('Invalid ship placement.');
    expect(rejection([{ type: 'carrier', x: 0, y: 0 }, ...rest]).reason).toBe('Invalid ship placement.');
  });

  it('rejects anything that is not an array', () => {
    for (const input of [null, undefined, 'fleet', 42, {}, { length: 5 }]) {
      expect(rejection(input).reason).toBe('Fleet must be an array of ships.');
    }
  });
});

describe('isShipPlacement', () => {
  it('accepts well-formed placements and rejects malformed ones', () => {
    expect(isShipPlacement({ type: 'submarine', x: 3, y: 4, orientation: 'vertical' })).toBe(true);
    expect(isShipPlacement({ type: 'submarine', x: 3, y: 4 })).toBe(false);
    expect(isShipPlacement({ type: 'dreadnought', x: 3, y: 4, orientation: 'vertical' })).toBe(false);
    expect(isShipPlacement(null)).toBe(false);
    expect(isShipPlacement('submarine')).toBe(false);
  });
});

describe('canPlace / placeShip / removeShip', () => {
  it('allows placing into free space and refuses placements outside the board', () => {
    expect(canPlace([], { type: 'carrier', x: 5, y: 9, orientation: 'horizontal' })).toBe(true);
    expect(canPlace([], { type: 'carrier', x: 6, y: 9, orientation: 'horizontal' })).toBe(false);
    expect(placeShip([], { type: 'carrier', x: 6, y: 9, orientation: 'horizontal' })).toBeNull();
  });

  it('refuses a placement that overlaps a different ship', () => {
    const blocking: ShipPlacement = { type: 'cruiser', x: 2, y: 0, orientation: 'vertical' };
    expect(canPlace(VALID_FLEET, blocking)).toBe(false);
    expect(placeShip(VALID_FLEET, blocking)).toBeNull();
  });

  it("ignores the ship's own old position when moving it", () => {
    // Shifting the carrier one cell right overlaps only its own previous cells.
    const moved: ShipPlacement = { type: 'carrier', x: 1, y: 0, orientation: 'horizontal' };
    expect(canPlace(VALID_FLEET, moved)).toBe(true);
    const next = mustPlace(VALID_FLEET, moved);
    expect(next).toHaveLength(5);
    expect(next.filter((s) => s.type === 'carrier')).toEqual([moved]);
    expect(validateFleet(next)).toEqual({ ok: true });
  });

  it('does not mutate the input fleet', () => {
    const original = VALID_FLEET.map((s) => ({ ...s }));
    placeShip(original, { type: 'carrier', x: 1, y: 0, orientation: 'horizontal' });
    removeShip(original, 'carrier');
    rotateShip(original, 'destroyer');
    expect(original).toEqual(VALID_FLEET);
  });

  it('adds a new ship type to a partial fleet', () => {
    const destroyer: ShipPlacement = { type: 'destroyer', x: 0, y: 0, orientation: 'horizontal' };
    expect(mustPlace([], destroyer)).toEqual([destroyer]);
  });

  it('removeShip drops only the requested type', () => {
    const fleet = removeShip(VALID_FLEET, 'cruiser');
    expect(fleet).toHaveLength(4);
    expect(fleet.some((s) => s.type === 'cruiser')).toBe(false);
    expect(removeShip(fleet, 'cruiser')).toEqual(fleet);
  });
});

describe('rotate / rotateShip', () => {
  it('rotate flips the orientation', () => {
    expect(rotate('horizontal')).toBe('vertical');
    expect(rotate('vertical')).toBe('horizontal');
  });

  it('rotates around the anchor when there is room, and rotating back restores the ship', () => {
    const destroyer: ShipPlacement = { type: 'destroyer', x: 0, y: 0, orientation: 'horizontal' };
    const cruiser: ShipPlacement = { type: 'cruiser', x: 5, y: 5, orientation: 'horizontal' };
    const rotated = mustRotate([destroyer, cruiser], 'cruiser');
    expect(findShip(rotated, 'cruiser')).toEqual({ type: 'cruiser', x: 5, y: 5, orientation: 'vertical' });
    expect(findShip(rotated, 'destroyer')).toEqual(destroyer);
    expect(findShip(mustRotate(rotated, 'cruiser'), 'cruiser')).toEqual(cruiser);
  });

  it('shifts a rotation that would leave the board back inside (horizontal -> vertical)', () => {
    const fleet: Fleet = [{ type: 'carrier', x: 5, y: 7, orientation: 'horizontal' }];
    const carrier = findShip(mustRotate(fleet, 'carrier'), 'carrier');
    expect(carrier).toEqual({ type: 'carrier', x: 5, y: 5, orientation: 'vertical' });
    expect(placementInsideBoard(carrier)).toBe(true);
  });

  it('shifts a rotation that would leave the board back inside (vertical -> horizontal)', () => {
    const fleet: Fleet = [{ type: 'carrier', x: 8, y: 2, orientation: 'vertical' }];
    expect(findShip(mustRotate(fleet, 'carrier'), 'carrier')).toEqual({ type: 'carrier', x: 5, y: 2, orientation: 'horizontal' });
  });

  it('returns null when the rotated ship would overlap another ship', () => {
    const fleet: Fleet = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'horizontal' },
      { type: 'battleship', x: 0, y: 1, orientation: 'vertical' },
    ];
    expect(rotateShip(fleet, 'destroyer')).toBeNull();
    expect(fleet).toHaveLength(2);
  });

  it('returns null when even the shifted position overlaps', () => {
    const fleet: Fleet = [
      { type: 'carrier', x: 5, y: 7, orientation: 'horizontal' },
      { type: 'destroyer', x: 5, y: 5, orientation: 'vertical' },
    ];
    expect(rotateShip(fleet, 'carrier')).toBeNull();
  });

  it('returns null for a ship that is not in the fleet', () => {
    expect(rotateShip([], 'carrier')).toBeNull();
    expect(rotateShip(without(VALID_FLEET, 'carrier'), 'carrier')).toBeNull();
  });
});

describe('randomFleet', () => {
  it('always produces a valid fleet with a seeded rng (500 seeds)', () => {
    const invalid: { seed: number; reason: string }[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      const v = validateFleet(randomFleet(makeLcg(seed)));
      if (!v.ok) invalid.push({ seed, reason: v.reason });
    }
    expect(invalid).toEqual([]);
  });

  it('is deterministic for a given seed', () => {
    expect(randomFleet(makeLcg(42))).toStrictEqual(randomFleet(makeLcg(42)));
    expect(randomFleet(makeLcg(2024))).toStrictEqual(randomFleet(makeLcg(2024)));
  });

  it('produces different fleets for different seeds', () => {
    expect(randomFleet(makeLcg(1))).not.toEqual(randomFleet(makeLcg(2)));
  });

  it('uses both orientations and places exactly one ship of each type', () => {
    const fleets = Array.from({ length: 50 }, (_, i) => randomFleet(makeLcg(i + 1)));
    const expectedTypes = [...SHIP_TYPES].sort();
    expect(fleets.every((f) => f.map((s) => s.type).sort().join() === expectedTypes.join())).toBe(true);
    const orientations = new Set<Orientation>(fleets.flat().map((s) => s.orientation));
    expect(orientations).toEqual(new Set<Orientation>(['horizontal', 'vertical']));
  });

  it('works with the default Math.random rng', () => {
    expect(validateFleet(randomFleet())).toEqual({ ok: true });
  });
});

describe('fleetCellMap', () => {
  it('maps all 17 occupied cells to their ship type', () => {
    const map = fleetCellMap(VALID_FLEET);
    expect(map.size).toBe(TOTAL_SHIP_CELLS);
    expect(map.get(coordKey({ x: 4, y: 0 }))).toBe('carrier');
    expect(map.get(coordKey({ x: 1, y: 8 }))).toBe('destroyer');
    expect(map.get(coordKey({ x: 9, y: 9 }))).toBeUndefined();
  });
});

describe('coordinate helpers', () => {
  it('labels coordinates like a classic Battleship grid', () => {
    expect(coordLabel({ x: 0, y: 0 })).toBe('A1');
    expect(coordLabel({ x: 9, y: 9 })).toBe('J10');
    expect(coordLabel({ x: 2, y: 4 })).toBe('C5');
    expect(coordLabel({ x: 10, y: 0 })).toBe('?1');
  });

  it('round-trips coordinate keys', () => {
    expect(coordKey({ x: 3, y: 7 })).toBe('3,7');
    expect(parseCoordKey('3,7')).toEqual({ x: 3, y: 7 });
  });

  it('TOTAL_SHIP_CELLS matches the ship specs', () => {
    expect(SHIP_TYPES.reduce((sum, t) => sum + SHIP_SPECS[t].size, 0)).toBe(TOTAL_SHIP_CELLS);
  });
});
