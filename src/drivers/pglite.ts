import type { PGliteOptions } from '@electric-sql/pglite';

import { PGlite } from '@electric-sql/pglite';
import { Effect, Layer, Option, Pool, Stream } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { ConnectionFailureError } from '#errors/errors.js';
import {
  ConstraintCheckError,
  ConstraintCheckNotNullError,
} from '#errors/errors.js';
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

  if (code === '23514') {
    return new ConstraintCheckError({ sql });
  }

  if (code === '23502') {
    return new ConstraintCheckNotNullError({ sql });
  }

  if (code === '08006') {
    return new ConnectionFailureError({ cause, params, sql });
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
      executeStream: (sql, params, chunkSize = 100) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const cursorName = `c_${Math.random().toString(36).slice(2)}`;
            //   PG cursors require BEGIN

            yield* Effect.tryPromise({
              try: () =>
                pg.exec(`BEGIN; DECLARE ${cursorName} CURSOR FOR ${sql}`),
              catch: (cause) => new DbError({ cause, sql, params }),
            });

            yield* Effect.addFinalizer(() =>
              Effect.tryPromise(() => pg.exec(`CLOSE ${cursorName}; COMMIT`)),
            );

            return Stream.paginate(null, () =>
              Effect.tryPromise({
                try: () =>
                  pg.query(
                    `FETCH ${chunkSize} FROM ${cursorName}`,
                    params as unknown[],
                  ),
                catch: (cause) => new DbError({ cause, sql, params }),
              }).pipe(
                Effect.map((r) => {
                  const rows = r.rows as Record<string, unknown>[];
                  return [
                    rows,
                    rows.length === 0 ? Option.none() : Option.some(null),
                  ] as const;
                }),
              ),
            );
          }),
        ),
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

export const makePool = (size = 1, options?: PGliteOptions) =>
  Pool.make({ acquire: make(options), size });
