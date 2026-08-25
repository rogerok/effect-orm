import Database from 'better-sqlite3';
import { Effect, Layer } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { ConstraintCheckNotNullError } from '#errors/errors.js';
import { ConstraintCheckError } from '#errors/errors.js';
import { UniqueViolationError } from '#errors/errors.js';
import { ForeignKeyViolationError } from '#errors/errors.js';
import { DbError } from '#errors/errors.js';

export interface SqliteOptions {
  readonly path: string;
  readonly enableForeignKeys?: boolean;
  readonly readonly?: boolean;
}

const mapSqliteError = (
  cause: unknown,
  sql: string,
  params: ReadonlyArray<unknown>,
): DriverError => {
  const code = (cause as { code?: string })?.code;
  const msg = (cause as Error)?.message ?? '';

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

  return new DbError({ cause, sql, params });
};

const make = (options: SqliteOptions) =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const instance = new Database();

          if (options.enableForeignKeys) {
            instance.pragma('foreign_keys = ON');
          }

          return instance;
        },
        catch: (cause) => new DbError({ cause, sql: '<connect>', params: [] }),
      }),
      (instance) => Effect.sync(() => instance.close()),
    );

    return Driver.of({
      dialect: SqliteDialect,
      executeRaw: (sql, params) =>
        Effect.try({
          try: () => {
            const stmt = db.prepare(sql);

            if (stmt.reader) {
              const rows = stmt.all(...(params as unknown[])) as Record<
                string,
                unknown
              >[];

              return { rows, affectedRows: 0 };
            }

            const info = stmt.run(...(params as unknown[]));

            return {
              rows: [],
              affectedRows: info.changes,
              lastInsertRowId: info.lastInsertRowid,
            };
          },
          catch: (cause) => mapSqliteError(cause, sql, params),
        }),
    });
  });

export const layer = (options: SqliteOptions) =>
  Layer.effect(Driver, make(options));
