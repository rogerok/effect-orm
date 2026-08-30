import { describe, it } from '@effect/vitest';
import { Effect, Layer, Result } from 'effect';
import { expect } from 'vitest';

import type { Dialect } from '#dialect.js';
import type { DriverError } from '#errors/errors.js';

import { SqliteDialect } from '#dialect.js';
import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { DatabaseBusyError } from '#errors/errors.js';
import {
  ConnectionFailureError,
  UniqueViolationError,
} from '#errors/errors.js';
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

        yield* db.executeRaw('CREATE TABLE users', []);
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      if (Result.isSuccess(result)) {
        throw new Error('Expect failure');
      }

      expect(Result.isFailure(result)).toBe(true);
      expect(result.failure).toMatchObject(err);
      expect(result.failure).toBeInstanceOf(ConnectionFailureError);
      expect(attempts).toBe(3);
    }),
  );

  it.effect('performs at most 3 attempts for a DatabaseBusyError', () =>
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

      const stack = RetryLayer({ maxAttempts: 3, exponentMs: 0 }).pipe(
        Layer.provide(layer),
      );

      const program = Effect.gen(function* () {
        const db = yield* Driver;

        yield* db.executeRaw('CREATE TABLE users', []);
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      // TODO: rewrite to matching for vitest
      if (Result.isSuccess(result)) {
        throw new Error('Expect failure');
      }

      expect(Result.isFailure(result)).toBe(true);
      expect(result.failure).toMatchObject(err);
      expect(result.failure).toBeInstanceOf(DatabaseBusyError);
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

        yield* db.executeRaw('CREATE TABLE users', []);
      }).pipe(Effect.provide(stack));

      const result = yield* Effect.result(program);

      if (Result.isSuccess(result)) {
        throw new Error('Expect failure');
      }

      expect(result.failure).toBeInstanceOf(UniqueViolationError);
      expect(result.failure).toMatchObject(err);
      expect(Result.isFailure(result)).toBe(true);
      expect(attempts).toBe(1);
    }),
  );
});
