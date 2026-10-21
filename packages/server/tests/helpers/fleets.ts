import { coordKey, shipCells, type Coord, type Fleet } from '@battleship/shared';

/** Horizontal fleet occupying rows 0-4 (one ship per row, anchored at column 0). */
export const FLEET_TOP: Fleet = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 1, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 3, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'horizontal' },
];

/** Horizontal fleet occupying rows 5-9 (disjoint from FLEET_TOP). */
export const FLEET_BOTTOM: Fleet = [
  { type: 'carrier', x: 5, y: 5, orientation: 'horizontal' },
  { type: 'battleship', x: 6, y: 6, orientation: 'horizontal' },
  { type: 'cruiser', x: 7, y: 7, orientation: 'horizontal' },
  { type: 'submarine', x: 7, y: 8, orientation: 'horizontal' },
  { type: 'destroyer', x: 8, y: 9, orientation: 'horizontal' },
];

/** All 17 cells of a fleet, ship by ship. */
export function cellsOf(fleet: Fleet): Coord[] {
  return fleet.flatMap((s) => shipCells(s));
}

export function cellKeys(fleet: Fleet): Set<string> {
  return new Set(cellsOf(fleet).map(coordKey));
}

/** Cells of the board that no ship of `fleet` occupies (guaranteed misses against that fleet). */
export function missesAgainst(fleet: Fleet): Coord[] {
  const occupied = cellKeys(fleet);
  const out: Coord[] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!occupied.has(coordKey({ x, y }))) out.push({ x, y });
  return out;
}

/** Tiny seeded PRNG (mulberry32) for deterministic AI / fleet generation in tests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
