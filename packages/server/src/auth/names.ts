import { AVATAR_IDS, DISPLAY_NAME_MAX, type AvatarId } from '@battleship/shared';

/** Ranks are at most 10 characters and call signs at most 9, so "Rank Name" always fits DISPLAY_NAME_MAX (20). */
const RANKS = [
  'Captain',
  'Admiral',
  'Commodore',
  'Skipper',
  'Navigator',
  'Ensign',
  'Commander',
  'Bosun',
  'Corsair',
  'Helmsman',
  'Gunner',
  'Lookout',
] as const;

const CALL_SIGNS = [
  'Nova',
  'Reef',
  'Tide',
  'Harbor',
  'Gale',
  'Kraken',
  'Coral',
  'Storm',
  'Anchor',
  'Drift',
  'Siren',
  'Marlin',
  'Horizon',
  'Breaker',
  'Compass',
  'Lagoon',
  'Ember',
  'Frost',
  'Rudder',
  'Beacon',
  'Squall',
  'Tempest',
  'Trident',
  'Pelican',
  'Osprey',
  'Mariner',
  'Harpoon',
  'Cutlass',
  'Barnacle',
  'Atlas',
] as const;

export type Rng = () => number;

function pick<T>(list: readonly T[], rng: Rng): T {
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  return list[index] as T;
}

/** A random guest call sign such as "Captain Nova" or "Admiral Reef". */
export function randomCallSign(rng: Rng = Math.random): string {
  return `${pick(RANKS, rng)} ${pick(CALL_SIGNS, rng)}`.slice(0, DISPLAY_NAME_MAX);
}

export function randomAvatar(rng: Rng = Math.random): AvatarId {
  return pick(AVATAR_IDS, rng);
}
