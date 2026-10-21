import type { Rng } from '../engine/placement';
import type { Coord, EnemyBoardView } from '../types';
import type { AiOpponent } from './types';
import { analyzeView, lineExtensionCells, pickRandom, randomUntried, untriedNeighbours, type ViewAnalysis } from './util';

/**
 * Hunt-mode candidates: untried cells on a parity lattice sized to the smallest remaining ship. Every ship
 * of length `p` covers exactly one cell of each residue class of `(x + y) mod p`, so firing at a single class
 * is enough to find it. The class with the fewest untried cells is kept, so the AI keeps draining the lattice
 * it has already invested in instead of hopping between classes (the choice is recomputed from the view only).
 */
export function parityHuntCells(a: ViewAnalysis): Coord[] {
  const p = a.remainingSizes[0] ?? 1;
  if (p <= 1 || a.untried.length === 0) return a.untried;
  const counts = new Array<number>(p).fill(0);
  for (const c of a.untried) counts[(c.x + c.y) % p] = (counts[(c.x + c.y) % p] ?? 0) + 1;
  let best = -1;
  for (let k = 0; k < p; k++) {
    const n = counts[k] ?? 0;
    if (n > 0 && (best === -1 || n < (counts[best] ?? 0))) best = k;
  }
  if (best === -1) return a.untried;
  return a.untried.filter((c) => (c.x + c.y) % p === best);
}

/**
 * Target-mode choice, or undefined when no unresolved hit has an untried neighbour.
 * 1. Two or more collinear adjacent hits: extend the line at either end (misses, sunk cells and edges stop it).
 * 2. Otherwise fire at an untried orthogonal neighbour of an unresolved hit, newest hit first.
 */
export function mediumTargetShot(a: ViewAnalysis, rng: Rng): Coord | undefined {
  const extensions = lineExtensionCells(a);
  if (extensions.length > 0) return pickRandom(extensions, rng);
  for (let i = a.unresolvedHits.length - 1; i >= 0; i--) {
    const hit = a.unresolvedHits[i];
    if (!hit) continue;
    const neighbours = untriedNeighbours(a, hit);
    if (neighbours.length > 0) return pickRandom(neighbours, rng);
  }
  return undefined;
}

/** Medium: classic hunt/target with parity hunting. */
export function chooseMediumShot(view: EnemyBoardView, rng: Rng): Coord {
  const analysis = analyzeView(view);
  if (analysis.unresolvedHits.length > 0) {
    const target = mediumTargetShot(analysis, rng);
    if (target) return target;
  }
  return pickRandom(parityHuntCells(analysis), rng) ?? randomUntried(analysis, view, rng);
}

export function createMediumAi(rng: Rng): AiOpponent {
  return {
    difficulty: 'medium',
    chooseShot: (view) => chooseMediumShot(view, rng),
  };
}
