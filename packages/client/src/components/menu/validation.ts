import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from '@battleship/shared';
import { errorCodeOf, messageOf } from './errors';

/*
 * Client-side mirrors of the server's zod schemas (shared/src/protocol.ts). They exist to give
 * immediate, friendly feedback; the server remains the authority and its INVALID_PAYLOAD details
 * are mapped back onto fields by `extractFieldErrors`.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const USERNAME_RE = /^[a-z0-9_]+$/;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} _.\-']+$/u;

/** Usernames are stored lower-case; normalise before validating or sending. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const value = normalizeUsername(raw);
  if (value.length === 0) return 'Choose a username.';
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) return `Usernames are ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(value)) return 'Use lowercase letters, numbers and underscores only.';
  return null;
}

export function validatePassword(raw: string): string | null {
  if (raw.length === 0) return 'Choose a password.';
  if (raw.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (raw.length > PASSWORD_MAX) return `Passwords can’t be longer than ${PASSWORD_MAX} characters.`;
  return null;
}

export function validateDisplayName(raw: string, opts: { optional?: boolean } = {}): string | null {
  const value = raw.trim();
  if (value.length === 0) return opts.optional ? null : 'Enter a display name.';
  if (value.length < DISPLAY_NAME_MIN || value.length > DISPLAY_NAME_MAX) {
    return `Display names are ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} characters.`;
  }
  if (!DISPLAY_NAME_RE.test(value)) return "Only letters, numbers, spaces and _ . - ' are allowed.";
  return null;
}

export interface FieldErrors {
  /** Error that belongs to the whole form (wrong credentials, network failure…). */
  form: string | null;
  /** Errors keyed by field name (`username`, `password`, `displayName`, `avatar`). */
  fields: Record<string, string>;
}

export const NO_ERRORS: FieldErrors = { form: null, fields: {} };

/** Maps an API failure onto form fields so it can be shown inline next to the offending input. */
export function extractFieldErrors(err: unknown): FieldErrors {
  const code = errorCodeOf(err);
  switch (code) {
    case 'USERNAME_TAKEN':
      return { form: null, fields: { username: 'That username is already taken.' } };
    case 'INVALID_CREDENTIALS':
      return { form: 'Incorrect username or password.', fields: {} };
    case 'RATE_LIMITED':
      return { form: 'Too many attempts. Please wait a moment and try again.', fields: {} };
    case 'INVALID_PAYLOAD': {
      const fields = fieldErrorsFromDetails((err as { details?: unknown }).details);
      return Object.keys(fields).length > 0
        ? { form: null, fields }
        : { form: messageOf(err) || 'Please check the form and try again.', fields: {} };
    }
    default:
      return { form: messageOf(err), fields: {} };
  }
}

/**
 * Extracts `{ field: message }` pairs from INVALID_PAYLOAD details. Understands the server's
 * `{ issues: [{ path: 'username', message }] }` shape plus raw zod issue arrays (`path` as array),
 * flattened `{ fieldErrors }` and treeified `{ properties }` payloads, so a server refactor does
 * not silently drop inline errors.
 */
export function fieldErrorsFromDetails(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!details || typeof details !== 'object') return out;

  const add = (key: unknown, message: unknown) => {
    const field = Array.isArray(key) ? key[0] : typeof key === 'string' ? key.split('.')[0] : undefined;
    if (typeof field === 'string' && field && typeof message === 'string' && message && !(field in out)) out[field] = message;
  };

  if (Array.isArray(details)) {
    for (const issue of details) {
      if (issue && typeof issue === 'object') {
        const { path, message } = issue as { path?: unknown; message?: unknown };
        add(path, message);
      }
    }
    return out;
  }

  const obj = details as Record<string, unknown>;
  if (Array.isArray(obj['issues'])) return fieldErrorsFromDetails(obj['issues']);

  const flat = obj['fieldErrors'];
  if (flat && typeof flat === 'object') {
    for (const [key, messages] of Object.entries(flat as Record<string, unknown>)) add(key, Array.isArray(messages) ? messages[0] : messages);
    return out;
  }

  const props = obj['properties'];
  if (props && typeof props === 'object') {
    for (const [key, node] of Object.entries(props as Record<string, unknown>)) {
      const errors = (node as { errors?: unknown } | null)?.errors;
      add(key, Array.isArray(errors) ? errors[0] : undefined);
    }
  }
  return out;
}
