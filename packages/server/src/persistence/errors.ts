/** Raised when a username is already in use (unique constraint). Mapped to HTTP 409 USERNAME_TAKEN. */
export class UsernameTakenError extends Error {
  readonly code = 'USERNAME_TAKEN' as const;
  readonly username: string;

  constructor(username: string) {
    super(`Username "${username}" is already taken`);
    this.name = 'UsernameTakenError';
    this.username = username;
  }
}

/** Raised when an update targets a record that does not exist. Mapped to HTTP 404 NOT_FOUND. */
export class RecordNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'RecordNotFoundError';
    this.entity = entity;
    this.id = id;
  }
}
