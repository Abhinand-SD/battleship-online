import { compare, hash } from 'bcryptjs';

/** bcrypt work factor. 10 keeps login/registration around 50-100ms on commodity hardware. */
export const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/** Constant-false for accounts without a password (guests). */
export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) return false;
  return compare(password, passwordHash);
}

let dummyHash: Promise<string> | null = null;

/**
 * Runs a bcrypt comparison against a throwaway hash so that a login attempt for an unknown username
 * takes about as long as one with a wrong password (no username enumeration via timing).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash('not-a-real-password', BCRYPT_COST);
  await compare(password, await dummyHash);
}
