/** What the landing page asked the menu to do, carried in the `/play` query string. */
export type MenuIntent = 'quick' | 'friends' | 'practice';

const FLAGS: readonly { key: string; intent: MenuIntent }[] = [
  { key: 'quick', intent: 'quick' },
  { key: 'friends', intent: 'friends' },
  { key: 'practice', intent: 'practice' },
];

/**
 * Reads the landing-page intent from `/play?quick=1`, `/play?friends=1` or `/play?practice=1`.
 * Any value other than `0` / `false` counts as "on"; the first matching flag wins.
 */
export function readMenuIntent(params: URLSearchParams): MenuIntent | null {
  for (const { key, intent } of FLAGS) {
    const value = params.get(key);
    if (value !== null && value !== '0' && value !== 'false') return intent;
  }
  return null;
}
