import { describe, it } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Ref, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { expect } from 'vitest';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { StatementTimeoutError } from '#errors/errors.js';
import { StatementTimeoutLayer } from '#layers/statement-timeout.js';

const timeoutMs = 15;
const timeoutDuration = Duration.millis(timeoutMs);
const query = 'SELECT * FROM users';
const writeQuery = 'UPDATE accounts SET balance = balance - 100 WHERE id = 1';

const slowTimeoutMs = 20;
const slowQueryDuration = Duration.millis(slowTimeoutMs);

const rawResult = {
  affectedRows: 0,
  rows: [],
} as const;

const fastDriver = Layer.succeed(
  Driver,
  Driver.of({
    executeStream: () => Stream.empty,
    dialect: SqliteDialect,
    executeRaw: () => Effect.succeed(rawResult),
  }),
);

const slowDriver = Layer.effect(
  Driver,
  Effect.gen(function* () {
    const inner = yield* Driver;
    return Driver.of({
      executeStream: inner.executeStream,
      dialect: inner.dialect,
      executeRaw: (sql, params) =>
        Effect.gen(function* () {
          yield* Effect.sleep(slowQueryDuration);
          return yield* inner.executeRaw(sql, params);
        }),
    });
  }),
).pipe(Layer.provide(fastDriver));

const executeSlowQuery = (sql: string, duration: Duration.Input) =>
  Effect.gen(function* () {
    const db = yield* Driver;

    const queryFiber = yield* db.executeRaw(sql, []).pipe(Effect.forkChild);

    yield* TestClock.adjust(duration);
    return yield* Fiber.join(queryFiber);
  });

describe('StatementTimeoutLayer', () => {
  // PGlite is not used here: it runs Postgres in the JS thread, so a blocking
  // pg_sleep finishes before any timer fires, and it ignores statement_timeout.
  // A driver with an interruptible write checks what the layer guarantees:
  // the timed-out write is interrupted and never applied.
  it.effect('cancels a slow write without changing the balance', () =>
    Effect.gen(function* () {
      const balance = yield* Ref.make(1000);
      const writingDriver = Layer.succeed(
        Driver,
        Driver.of({
          executeStream: () => Stream.empty,
          dialect: SqliteDialect,
          executeRaw: () =>
            Effect.gen(function* () {
              yield* Effect.sleep(slowQueryDuration);
              yield* Ref.update(balance, (value) => value - 100);
              return rawResult;
            }),
        }),
      );

      const outcome = yield* Effect.result(
        executeSlowQuery(writeQuery, timeoutDuration).pipe(
          Effect.provide(
            StatementTimeoutLayer({ timeoutMs }).pipe(
              Layer.provide(writingDriver),
            ),
          ),
        ),
      );
      yield* TestClock.adjust(slowQueryDuration);

      expect(outcome).toBeFailure(StatementTimeoutError);
      expect(yield* Ref.get(balance)).toBe(1000);
    }),
  );

  it.effect('Should return error', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        executeSlowQuery(query, timeoutDuration),
      );

      expect(result).toBeFailure(StatementTimeoutError);
      expect(result).toEqualFailure(
        new StatementTimeoutError({ sql: query, timeoutMs }),
      );
    }).pipe(
      Effect.provide([
        StatementTimeoutLayer({ timeoutMs }).pipe(Layer.provide(slowDriver)),
      ]),
    ),
  );

  it.effect('returns the query result before the timeout', () =>
    Effect.gen(function* () {
      const db = yield* Driver;

      const result = yield* db.executeRaw(query, []);

      expect(result).toEqual(rawResult);
    }).pipe(
      Effect.provide(
        StatementTimeoutLayer({ timeoutMs }).pipe(Layer.provide(fastDriver)),
      ),
    ),
  );
});
