import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@battleship/shared';

/**
 * Normalises whatever the user typed or pasted into a bare room code.
 *
 * Accepts plain codes in any case, with or without the display dash (`abc-def` → `ABCDEF`), and
 * full invite links or paths (`http://host/join/abc-def?x=1` → `ABCDEF`), where the last path
 * segment wins. The result is upper-cased, stripped of anything that is not A–Z / 0–9 and capped
 * at {@link ROOM_CODE_LENGTH} characters.
 */
export function extractRoomCode(raw: string): string {
  let value = raw.trim();
  if (value.includes('/')) {
    const withoutQuery = value.split(/[?#]/)[0] ?? '';
    const segments = withoutQuery.split('/').filter((segment) => segment.length > 0);
    value = segments[segments.length - 1] ?? '';
  }
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

/** Display form used while typing: `ABCDEF` → `ABC-DEF`, `AB` → `AB`. */
export function formatRoomCodeInput(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

const ALPHABET = new Set(ROOM_CODE_ALPHABET.split(''));

/** Characters that look like code characters but are never issued (the alphabet avoids 0/O and 1/I mix-ups). */
const CONFUSABLES = '0O1I'.split('').filter((ch) => !ALPHABET.has(ch));

/** Returns a human readable problem with a normalised code, or `null` when it can be sent to the server. */
export function describeRoomCodeProblem(code: string): string | null {
  if (code.length === 0) return 'Enter the room code your friend shared with you.';
  if (code.length < ROOM_CODE_LENGTH) return `Room codes are ${ROOM_CODE_LENGTH} characters long.`;
  if (code.split('').some((ch) => !ALPHABET.has(ch))) {
    return `Room codes never contain ${CONFUSABLES.join(', ')} — double-check the code.`;
  }
  return null;
}
