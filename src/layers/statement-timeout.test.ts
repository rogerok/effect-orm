import { describe, it } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { expect } from 'vitest';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import * as PGliteDriver from '#drivers/pglite.js';
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
  it.live('cancels a slow write without changing the balance', () =>
    Effect.gen(function* () {
      const original = yield* Driver;

      const stack = StatementTimeoutLayer({ timeoutMs: 10 }).pipe(
        Layer.provide(Layer.succeed(Driver, original)),
      );

      yield* original.executeRaw(
        `CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)`,
        [],
      );
      yield* original.executeRaw(
        `INSERT INTO accounts (id, balance) VALUES (1, 1000)`,
        [],
      );

      const program = Effect.gen(function* () {
        const db = yield* Driver;

        yield* db.executeRaw(
          `UPDATE accounts SET balance = balance - 100 FROM pg_sleep(0.1) WHERE id = 1`,
          [],
        );
      }).pipe(Effect.provide(stack));

      const outcome = yield* Effect.result(program);

      const result = yield* original.executeRaw(
        `SELECT id, balance FROM accounts WHERE accounts.id = ${original.dialect.placeholder(1)}`,
        [1],
      );

      expect(outcome).toBeFailure(StatementTimeoutError);
      expect(result.rows).toEqual([{ id: 1, balance: 1000 }]);
    }).pipe(Effect.provide(PGliteDriver.layer())),
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
