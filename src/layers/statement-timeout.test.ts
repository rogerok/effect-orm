import { describe, it } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Result } from 'effect';
import { TestClock } from 'effect/testing';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { StatementTimeoutError } from '#errors/errors.js';
import { StatementTimeoutLayer } from '#layers/statement-timeout.js';

const timeoutMs = 15;
const timeoutDuration = Duration.millis(timeoutMs);
const query = 'SELECT * FROM users';

const slowTimeoutMs = 20;
const slowQueryDuration = Duration.millis(slowTimeoutMs);

const rawResult = {
  affectedRows: 0,
  rows: [],
} as const;

const fastDriver = Layer.succeed(
  Driver,
  Driver.of({
    dialect: SqliteDialect,
    executeRaw: () => Effect.succeed(rawResult),
  }),
);

const slowDriver = Layer.effect(
  Driver,
  Effect.gen(function* () {
    const inner = yield* Driver;
    return Driver.of({
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
  it.effect('Should return error', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        executeSlowQuery(query, timeoutDuration),
      );

      expect(result).toStrictEqual(
        Result.fail(new StatementTimeoutError({ sql: query, timeoutMs })),
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
