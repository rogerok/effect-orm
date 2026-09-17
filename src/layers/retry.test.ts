import { describe, it } from '@effect/vitest';
import { Effect, Layer, Stream } from 'effect';
import { expect } from 'vitest';

import type { Dialect } from '#dialect.js';
import type { DriverError } from '#errors/errors.js';

import { expectFailure } from '#config/result-matchers.js';
import { PgDialect, SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import {
  ConnectionFailureError,
  DatabaseBusyError,
  UniqueViolationError,
} from '#errors/errors.js';
import { MetricLayer } from '#layers/metric.js';
import { RetryLayer } from '#layers/retry.js';

interface FailingDriverOptions {
  readonly dialect: Dialect;
  readonly error: DriverError;
  readonly onAttempt: () => void;
}

const makeLayer = ({ onAttempt, error, dialect }: FailingDriverOptions) =>
  Layer.succeed(
    Driver,
    Driver.of({
      executeStream: () => Stream.empty,
      dialect,
      executeRaw: () =>
        Effect.suspend(() => {
          onAttempt();

          return Effect.fail(error);
        }),
    }),
  );

describe('RetryLayer', () => {
  it.effect('performs at most 3 attempts for a transient error', () =>
    Effect.gen(function* () {
      let attempts = 0;

      const err = {
        sql: 'test sql',
        params: [],
        cause: 'test cause',
      };

      const layer = makeLayer({
        dialect: PgDialect,
        onAttempt: () => (attempts += 1),
        error: new ConnectionFailureError(err),
      });

      const stack = RetryLayer({ maxAttempts: 3, exponentMs: 0 }).pipe(
        Layer.provide(layer),
      );

      const program = Effect.gen(function* () {
        const db = yield* Driver;

        yield* db.executeRaw('CREATE TABLE users', [], { canRetry: true });
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      expect(result).toBeFailure(ConnectionFailureError);
      expect(result).toEqualFailure(new ConnectionFailureError(err));

      expect(attempts).toBe(3);
    }),
  );

  it.effect(
    'performs at most 3 attempts for a DatabaseBusyError with outer layer',
    () =>
      Effect.gen(function* () {
        let attempts = 0;

        const err = {
          sql: 'test sql',
          params: [],
          cause: 'test cause',
        };

        const layer = makeLayer({
          dialect: SqliteDialect,
          onAttempt: () => (attempts += 1),
          error: new DatabaseBusyError(err),
        });

        const stack = MetricLayer.pipe(
          Layer.provide(
            RetryLayer({ maxAttempts: 3, exponentMs: 0 }).pipe(
              Layer.provide(layer),
            ),
          ),
        );

        const program = Effect.gen(function* () {
          const db = yield* Driver;

          yield* db.executeRaw('CREATE TABLE users', [], { canRetry: true });
        }).pipe(Effect.provide(stack));

        const result = yield* Effect.result(program);

        expect(result).toBeFailure(DatabaseBusyError);
        expect(result).toEqualFailure(new DatabaseBusyError(err));
        expect(attempts).toBe(3);
      }),
  );

  it.effect('does not retry a non-transient error', () =>
    Effect.gen(function* () {
      let attempts = 0;

      const err = {
        sql: 'test sql',
        constraint: 'test',
      };

      const layer = makeLayer({
        dialect: PgDialect,
        onAttempt: () => (attempts += 1),
        error: new UniqueViolationError(err),
      });

      const stack = RetryLayer({ maxAttempts: 3, exponentMs: 0 }).pipe(
        Layer.provide(layer),
      );

      const program = Effect.gen(function* () {
        const db = yield* Driver;

        yield* db.executeRaw('CREATE TABLE users', [], { canRetry: true });
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      expect(result).toBeFailure(UniqueViolationError);
      expect(result).toEqualFailure(new UniqueViolationError(err));
      expect(attempts).toBe(1);
    }),
  );

  it.effect('does not retry a write after a lost response', () =>
    Effect.gen(function* () {
      let balance = 1000;
      let attempt = 0;

      const dbLayer = Layer.succeed(Driver, {
        executeStream: () => Stream.empty,
        dialect: PgDialect,
        executeRaw: () =>
          Effect.suspend(() => {
            balance -= 100;
            attempt += 1;

            if (attempt === 1) {
              return new ConnectionFailureError({
                cause: 'cause',
                sql: `UPDATE users SET balance = users.balance - 100 WHERE users.id = 1`,
                params: [1],
              });
            }

            return Effect.succeed({ affectedRows: 1, rows: [] });
          }),
      });

      const stack = RetryLayer({ maxAttempts: 3, exponentMs: 0 }).pipe(
        Layer.provide(dbLayer),
      );

      const program = Effect.gen(function* () {
        const db = yield* Driver;

        yield* db.executeRaw(
          `UPDATE users SET balance = users.balance - 100 WHERE users.id = ${db.dialect.placeholder(1)}`,
          [1],
        );
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      expect(result).toBeFailure();
      expect(expectFailure(result)).toMatchObject({
        cause: 'cause',
        sql: `UPDATE users SET balance = users.balance - 100 WHERE users.id = 1`,
        params: [1],
        _tag: 'ConnectionFailureError',
      });
      expect(balance).toBe(900);
    }),
  );
});
