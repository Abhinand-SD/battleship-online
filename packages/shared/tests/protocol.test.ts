import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../src/constants';
import type { Fleet } from '../src/types';
import {
  API_PREFIX,
  ERROR_CODES,
  attackPayloadSchema,
  avatarSchema,
  coordSchema,
  difficultySchema,
  displayNameSchema,
  fleetConfirmPayloadSchema,
  fleetSchema,
  guestPayloadSchema,
  loginPayloadSchema,
  passwordSchema,
  practiceStartPayloadSchema,
  profileUpdateSchema,
  registerPayloadSchema,
  rematchPayloadSchema,
  roomCodeSchema,
  roomCreatePayloadSchema,
  roomJoinPayloadSchema,
  roomReadyPayloadSchema,
  shipPlacementSchema,
  usernameSchema,
} from '../src/protocol';

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`expected input to parse but got: ${result.error.message}`);
  return result.data;
}

function accepts(schema: z.ZodType, input: unknown): boolean {
  return schema.safeParse(input).success;
}

const FLEET: Fleet = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 4, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 6, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 8, orientation: 'horizontal' },
];

describe('roomCodeSchema', () => {
  it('normalises case, dashes and whitespace', () => {
    expect(parsed(roomCodeSchema, 'ab-cd ef')).toBe('ABCDEF');
    expect(parsed(roomCodeSchema, 'abcdef')).toBe('ABCDEF');
    expect(parsed(roomCodeSchema, '  ABC-DEF  ')).toBe('ABCDEF');
    expect(parsed(roomCodeSchema, 'AB CD EF')).toBe('ABCDEF');
    expect(parsed(roomCodeSchema, 'ABCDEF')).toBe('ABCDEF');
  });

  it('accepts every symbol of the room code alphabet', () => {
    expect(parsed(roomCodeSchema, 'Z23456')).toBe('Z23456');
    expect(parsed(roomCodeSchema, '789abc')).toBe('789ABC');
  });

  it('rejects the wrong length after normalisation', () => {
    expect(accepts(roomCodeSchema, 'ABCDE')).toBe(false);
    expect(accepts(roomCodeSchema, 'ABCDEFG')).toBe(false);
    expect(accepts(roomCodeSchema, 'AB-CD')).toBe(false);
    expect(accepts(roomCodeSchema, '')).toBe(false);
    expect(accepts(roomCodeSchema, '------')).toBe(false);
  });

  it('rejects ambiguous characters 0, O, 1 and I', () => {
    expect(accepts(roomCodeSchema, 'ABCDE0')).toBe(false);
    expect(accepts(roomCodeSchema, 'ABCDEO')).toBe(false);
    expect(accepts(roomCodeSchema, 'ABCDE1')).toBe(false);
    expect(accepts(roomCodeSchema, 'ABCDEI')).toBe(false);
    expect(accepts(roomCodeSchema, 'abcdeo')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(accepts(roomCodeSchema, 234567)).toBe(false);
    expect(accepts(roomCodeSchema, null)).toBe(false);
    expect(accepts(roomCodeSchema, undefined)).toBe(false);
  });

  it('matches the constants it is built from', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

describe('roomJoinPayloadSchema', () => {
  it('normalises the code inside the payload', () => {
    expect(parsed(roomJoinPayloadSchema, { code: 'ab-cd ef' })).toEqual({ code: 'ABCDEF' });
    expect(accepts(roomJoinPayloadSchema, { code: 'ABCDE' })).toBe(false);
    expect(accepts(roomJoinPayloadSchema, {})).toBe(false);
  });
});

describe('coordSchema', () => {
  it('accepts integer coordinates inside the board only', () => {
    expect(parsed(coordSchema, { x: 0, y: 9 })).toEqual({ x: 0, y: 9 });
    expect(accepts(coordSchema, { x: 10, y: 0 })).toBe(false);
    expect(accepts(coordSchema, { x: 0, y: -1 })).toBe(false);
    expect(accepts(coordSchema, { x: 0.5, y: 0 })).toBe(false);
    expect(accepts(coordSchema, { x: Number.NaN, y: 0 })).toBe(false);
  });
});

describe('attackPayloadSchema', () => {
  it('accepts in-range integer coordinates with a positive move number', () => {
    expect(parsed(attackPayloadSchema, { x: 0, y: 0, moveNumber: 1 })).toEqual({ x: 0, y: 0, moveNumber: 1 });
    expect(parsed(attackPayloadSchema, { x: 9, y: 9, moveNumber: 250 })).toEqual({ x: 9, y: 9, moveNumber: 250 });
  });

  it('rejects float coordinates', () => {
    expect(accepts(attackPayloadSchema, { x: 1.5, y: 0, moveNumber: 1 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 2.0001, moveNumber: 1 })).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(accepts(attackPayloadSchema, { x: 10, y: 0, moveNumber: 1 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 10, moveNumber: 1 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: -1, y: 0, moveNumber: 1 })).toBe(false);
  });

  it('requires a positive integer moveNumber', () => {
    expect(accepts(attackPayloadSchema, { x: 0, y: 0 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 0, moveNumber: 0 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 0, moveNumber: -3 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 0, moveNumber: 1.5 })).toBe(false);
    expect(accepts(attackPayloadSchema, { x: 0, y: 0, moveNumber: '1' })).toBe(false);
  });

  it('rejects non-numeric coordinates and non-object payloads', () => {
    expect(accepts(attackPayloadSchema, { x: '1', y: 0, moveNumber: 1 })).toBe(false);
    expect(accepts(attackPayloadSchema, null)).toBe(false);
    expect(accepts(attackPayloadSchema, [0, 0, 1])).toBe(false);
  });
});

describe('shipPlacementSchema / fleetSchema', () => {
  it('accepts a well-formed placement and rejects bad types, orientations or anchors', () => {
    expect(accepts(shipPlacementSchema, { type: 'cruiser', x: 9, y: 9, orientation: 'vertical' })).toBe(true);
    expect(accepts(shipPlacementSchema, { type: 'frigate', x: 0, y: 0, orientation: 'vertical' })).toBe(false);
    expect(accepts(shipPlacementSchema, { type: 'cruiser', x: 0, y: 0, orientation: 'diagonal' })).toBe(false);
    expect(accepts(shipPlacementSchema, { type: 'cruiser', x: 10, y: 0, orientation: 'vertical' })).toBe(false);
    expect(accepts(shipPlacementSchema, { type: 'cruiser', x: 0.5, y: 0, orientation: 'vertical' })).toBe(false);
  });

  it('requires exactly five placements', () => {
    expect(parsed(fleetSchema, FLEET)).toEqual(FLEET);
    expect(accepts(fleetSchema, FLEET.slice(0, 4))).toBe(false);
    expect(accepts(fleetSchema, [...FLEET, { type: 'destroyer', x: 5, y: 8, orientation: 'horizontal' }])).toBe(false);
    expect(accepts(fleetSchema, [])).toBe(false);
    expect(accepts(fleetSchema, 'fleet')).toBe(false);
  });

  it('rejects a fleet containing one malformed placement', () => {
    expect(accepts(fleetSchema, [...FLEET.slice(0, 4), { type: 'destroyer', x: 0, y: 8 }])).toBe(false);
    expect(accepts(fleetSchema, [...FLEET.slice(0, 4), null])).toBe(false);
  });

  it('is structural only: overlapping or duplicated ships still pass (the engine rejects them)', () => {
    const overlapping = FLEET.map((s) => (s.type === 'battleship' ? { ...s, y: 0 } : s));
    const duplicated = [...FLEET.slice(1), { ...FLEET[4]!, x: 5 }];
    expect(accepts(fleetSchema, overlapping)).toBe(true);
    expect(accepts(fleetSchema, duplicated)).toBe(true);
  });

  it('fleetConfirmPayloadSchema wraps the fleet', () => {
    expect(accepts(fleetConfirmPayloadSchema, { fleet: FLEET })).toBe(true);
    expect(accepts(fleetConfirmPayloadSchema, { fleet: FLEET.slice(1) })).toBe(false);
    expect(accepts(fleetConfirmPayloadSchema, FLEET)).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('enforces the length boundaries after trimming', () => {
    expect(DISPLAY_NAME_MIN).toBe(2);
    expect(DISPLAY_NAME_MAX).toBe(20);
    expect(accepts(displayNameSchema, 'A')).toBe(false);
    expect(parsed(displayNameSchema, 'AB')).toBe('AB');
    expect(parsed(displayNameSchema, 'A'.repeat(20))).toBe('A'.repeat(20));
    expect(accepts(displayNameSchema, 'A'.repeat(21))).toBe(false);
    expect(parsed(displayNameSchema, `  ${'A'.repeat(20)}  `)).toBe('A'.repeat(20));
    expect(accepts(displayNameSchema, ' A ')).toBe(false);
    expect(accepts(displayNameSchema, '   ')).toBe(false);
  });

  it('allows letters in any script, digits, spaces and _ . - \' only', () => {
    expect(accepts(displayNameSchema, "O'Brien-Smith_2.0")).toBe(true);
    expect(accepts(displayNameSchema, 'Zoë Ångström')).toBe(true);
    expect(accepts(displayNameSchema, '李雷')).toBe(true);
    expect(accepts(displayNameSchema, 'bad<name>')).toBe(false);
    expect(accepts(displayNameSchema, 'name@mail')).toBe(false);
    expect(accepts(displayNameSchema, 'ship🚢')).toBe(false);
    expect(accepts(displayNameSchema, 'new\nline')).toBe(false);
    expect(accepts(displayNameSchema, 42)).toBe(false);
  });
});

describe('usernameSchema', () => {
  it('lower-cases and trims, then enforces 3-20 of [a-z0-9_]', () => {
    expect(parsed(usernameSchema, 'Admiral_99')).toBe('admiral_99');
    expect(parsed(usernameSchema, '  Admiral_99  ')).toBe('admiral_99');
    expect(parsed(usernameSchema, 'abc')).toBe('abc');
    expect(parsed(usernameSchema, 'a'.repeat(20))).toBe('a'.repeat(20));
  });

  it('rejects names outside the boundaries or with other characters', () => {
    expect(accepts(usernameSchema, 'ab')).toBe(false);
    expect(accepts(usernameSchema, 'a'.repeat(21))).toBe(false);
    expect(accepts(usernameSchema, 'a-b-c')).toBe(false);
    expect(accepts(usernameSchema, 'ab c')).toBe(false);
    expect(accepts(usernameSchema, 'ábcd')).toBe(false);
    expect(accepts(usernameSchema, 'name@x')).toBe(false);
    expect(accepts(usernameSchema, '')).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts 8 to 128 characters', () => {
    expect(accepts(passwordSchema, 'a'.repeat(7))).toBe(false);
    expect(accepts(passwordSchema, 'a'.repeat(8))).toBe(true);
    expect(accepts(passwordSchema, 'a'.repeat(128))).toBe(true);
    expect(accepts(passwordSchema, 'a'.repeat(129))).toBe(false);
    expect(accepts(passwordSchema, 12345678)).toBe(false);
  });
});

describe('auth payload schemas', () => {
  it('registerPayloadSchema normalises the username and keeps displayName optional', () => {
    expect(parsed(registerPayloadSchema, { username: 'Captain_Ahab', password: 'whitewhale' })).toEqual({
      username: 'captain_ahab',
      password: 'whitewhale',
    });
    expect(parsed(registerPayloadSchema, { username: 'ahab', password: 'whitewhale', displayName: ' Ahab ' })).toEqual({
      username: 'ahab',
      password: 'whitewhale',
      displayName: 'Ahab',
    });
    expect(accepts(registerPayloadSchema, { username: 'ab', password: 'whitewhale' })).toBe(false);
    expect(accepts(registerPayloadSchema, { username: 'ahab', password: 'short' })).toBe(false);
    expect(accepts(registerPayloadSchema, { username: 'ahab', password: 'whitewhale', displayName: 'A' })).toBe(false);
  });

  it('loginPayloadSchema requires both fields', () => {
    expect(accepts(loginPayloadSchema, { username: 'ahab', password: 'whitewhale' })).toBe(true);
    expect(accepts(loginPayloadSchema, { username: 'ahab' })).toBe(false);
    expect(accepts(loginPayloadSchema, { password: 'whitewhale' })).toBe(false);
  });

  it('guestPayloadSchema allows an absent or empty payload', () => {
    expect(accepts(guestPayloadSchema, undefined)).toBe(true);
    expect(accepts(guestPayloadSchema, {})).toBe(true);
    expect(parsed(guestPayloadSchema, { displayName: 'Guest 7' })).toEqual({ displayName: 'Guest 7' });
    expect(accepts(guestPayloadSchema, { displayName: 'X' })).toBe(false);
  });

  it('profileUpdateSchema accepts partial updates with known avatars only', () => {
    expect(accepts(profileUpdateSchema, {})).toBe(true);
    expect(accepts(profileUpdateSchema, { avatar: 'kraken' })).toBe(true);
    expect(accepts(profileUpdateSchema, { avatar: 'unicorn' })).toBe(false);
    expect(accepts(profileUpdateSchema, { displayName: 'Nemo' })).toBe(true);
    expect(accepts(avatarSchema, 'anchor')).toBe(true);
    expect(accepts(avatarSchema, 'Anchor')).toBe(false);
  });
});

describe('simple game payload schemas', () => {
  it('difficultySchema / practiceStartPayloadSchema', () => {
    expect(accepts(difficultySchema, 'hard')).toBe(true);
    expect(accepts(difficultySchema, 'nightmare')).toBe(false);
    expect(parsed(practiceStartPayloadSchema, { difficulty: 'easy' })).toEqual({ difficulty: 'easy' });
    expect(accepts(practiceStartPayloadSchema, {})).toBe(false);
  });

  it('roomReadyPayloadSchema / rematchPayloadSchema need real booleans', () => {
    expect(accepts(roomReadyPayloadSchema, { ready: true })).toBe(true);
    expect(accepts(roomReadyPayloadSchema, { ready: 'yes' })).toBe(false);
    expect(accepts(rematchPayloadSchema, { accept: false })).toBe(true);
    expect(accepts(rematchPayloadSchema, {})).toBe(false);
  });

  it('roomCreatePayloadSchema tolerates an absent payload', () => {
    expect(accepts(roomCreatePayloadSchema, undefined)).toBe(true);
    expect(accepts(roomCreatePayloadSchema, {})).toBe(true);
  });
});

describe('protocol constants', () => {
  it('error codes are unique and the API prefix is stable', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(ERROR_CODES).toContain('INVALID_FLEET');
    expect(ERROR_CODES).toContain('STALE_MOVE');
    expect(API_PREFIX).toBe('/api');
  });
});
