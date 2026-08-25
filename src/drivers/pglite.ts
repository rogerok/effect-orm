import type { PGliteOptions } from '@electric-sql/pglite';

import { PGlite } from '@electric-sql/pglite';
import { Effect, Layer } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import {
  ForeignKeyViolationError,
  UniqueViolationError,
} from '#errors/errors.js';
import { DbError } from '#errors/errors.js';

const mapPgError = (
  cause: unknown,
  sql: string,
  params: ReadonlyArray<unknown>,
): DriverError => {
  const code = (cause as { code?: string })?.code;
  const c = cause as { constraint?: string; message?: string };
  const constraint =
    c.constraint ?? c.message?.match(/constraint "([^"]+)"/)?.[1] ?? 'unknown';

  if (code === '23505') {
    return new UniqueViolationError({ constraint, sql });
  }

  if (code === '23503') {
    return new ForeignKeyViolationError({ constraint, sql });
  }

  return new DbError({ cause, sql, params });
};

const make = (options: PGliteOptions = {}) =>
  Effect.gen(function* () {
    const pg = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => PGlite.create(options),
        catch: (cause) => new DbError({ cause, sql: '<connect>', params: [] }),
      }),
      (instance) => Effect.promise(() => instance.close()),
    );

    return Driver.of({
      dialect: PgDialect,
      executeRaw: (sql, params) =>
        Effect.tryPromise({
          try: () => pg.query(sql, params as unknown[]),
          catch: (cause) => mapPgError(cause, sql, params),
        }).pipe(
          Effect.map((r) => ({
            rows: r.rows as ReadonlyArray<Record<string, unknown>>,
            affectedRows: r.affectedRows ?? 0,
          })),
        ),
    });
  });

export const layer = (options?: PGliteOptions) =>
  Layer.effect(Driver, make(options));
