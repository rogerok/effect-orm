import { Data } from 'effect';

export class DbError extends Data.TaggedError('DbError')<{
  readonly cause: unknown;
  readonly params: ReadonlyArray<unknown>;
  readonly sql: string;
}> {}

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  sql: string;
}> {}

export class TooManyError extends Data.TaggedError('TooManyError')<{
  readonly count: number;
  readonly sql: string;
}> {}

export class UniqueViolationError extends Data.TaggedError(
  'UniqueViolationError',
)<{
  readonly constraint: string;
  readonly sql: string;
}> {}

export class ForeignKeyViolationError extends Data.TaggedError(
  'ForeignKeyViolationError',
)<{
  readonly constraint: string;
  readonly sql: string;
}> {}

export class ConstraintCheckError extends Data.TaggedError(
  'ConstraintCheckError',
)<{
  readonly sql: string;
}> {}

export class ConstraintCheckNotNullError extends Data.TaggedError(
  'ConstraintCheckNotNullError',
)<{
  readonly sql: string;
}> {}

export class StatementTimeoutError extends Data.TaggedError(
  'StatementTimeoutError',
)<{
  readonly sql: string;
  readonly timeoutMs: number;
}> {}

export class ConnectionFailureError extends Data.TaggedError(
  'ConnectionFailureError',
)<{
  readonly cause: unknown;
  readonly params: ReadonlyArray<unknown>;
  readonly sql: string;
}> {}

export class DatabaseBusyError extends Data.TaggedError('DatabaseBusyError')<{
  readonly cause: unknown;
  readonly params: ReadonlyArray<unknown>;
  readonly sql: string;
}> {}

export class CodecError extends Data.TaggedError('CodecError')<{
  readonly cause: unknown;
  readonly column: string;
  readonly value: unknown;
}> {}

// Driver-level errors. NotFound/TooMany возникают выше, на уровне execute helpers
export type DriverError =
  | CodecError
  | ConnectionFailureError
  | ConstraintCheckError
  | ConstraintCheckNotNullError
  | DatabaseBusyError
  | DbError
  | ForeignKeyViolationError
  | StatementTimeoutError
  | UniqueViolationError;
