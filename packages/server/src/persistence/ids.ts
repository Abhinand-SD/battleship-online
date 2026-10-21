import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a cuid-like identifier: a leading "c", a base36 timestamp (so ids sort roughly by creation
 * time) and 16 random base36 characters (~82 bits of entropy). URL-safe, 25 characters long.
 * Used by both the in-memory and the Prisma repositories so ids look the same everywhere.
 */
export function newId(): string {
  const time = Date.now().toString(36);
  let random = '';
  for (const byte of randomBytes(16)) random += ALPHABET.charAt(byte % ALPHABET.length);
  return `c${time}${random}`;
}
