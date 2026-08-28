import { createClient, type InValue, LibsqlError } from '@libsql/client';
import { Effect, Layer } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { DatabaseBusyError } from '#errors/errors.js';
import {
  ConstraintCheckError,
  ConstraintCheckNotNullError,
  DbError,
  ForeignKeyViolationError,
  UniqueViolationError,
} from '#errors/errors.js';

export interface LibsqlOptions {
  readonly url: string;
}

const mapLibsqlError = (
  cause: unknown,
  sql: string,
  params: ReadonlyArray<unknown>,
): DriverError => {
  const code =
    cause instanceof LibsqlError
      ? (cause.extendedCode ?? cause.code)
      : undefined;

  const msg = cause instanceof Error ? cause.message : '';

  if (
    code?.startsWith('SQLITE_CONSTRAINT_UNIQUE') ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  ) {
    const constraint =
      msg.match(/UNIQUE constraint failed: (.+)$/)?.[1] ?? 'unknown';
    return new UniqueViolationError({ constraint, sql });
  }
  if (code?.startsWith('SQLITE_CONSTRAINT_FOREIGNKEY')) {
    return new ForeignKeyViolationError({ constraint: 'fk_violation', sql });
  }

  if (code?.startsWith('SQLITE_CONSTRAINT_CHECK')) {
    return new ConstraintCheckError({ sql });
  }

  if (code?.startsWith('SQLITE_CONSTRAINT_NOTNULL')) {
    return new ConstraintCheckNotNullError({ sql });
  }

  if (code === 'SQLITE_BUSY') {
    return new DatabaseBusyError({ sql, params, cause });
  }

  return new DbError({ cause, sql, params });
};

const make = (options: LibsqlOptions) =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.try({
        try: () => createClient(options),
        catch: (cause) => new DbError({ cause, sql: '<connect>', params: [] }),
      }),
      (client) => Effect.sync(() => client.close()),
    );

    return Driver.of({
      dialect: SqliteDialect,
      executeRaw: (sql, params) =>
        Effect.tryPromise({
          try: () => db.execute(sql, params as Array<InValue>),
          catch: (cause) => mapLibsqlError(cause, sql, params),
        }).pipe(
          Effect.map(({ rows, rowsAffected, lastInsertRowid }) => {
            if (lastInsertRowid === undefined) {
              return {
                rows,
                affectedRows: rowsAffected,
              };
            }

            return {
              rows,
              affectedRows: rowsAffected,
              lastInsertRowId: lastInsertRowid,
            };
          }),
        ),
    });
  });

export const layer = (options: LibsqlOptions) =>
  Layer.effect(Driver, make(options));
