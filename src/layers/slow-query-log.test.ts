import { describe, it } from '@effect/vitest';
import { Duration, Effect, Fiber, Layer, Logger, Stream } from 'effect';
import { TestClock } from 'effect/testing';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { SlowQueryLogLayer } from '#layers/slow-query-log.js';

interface LogEvent {
  readonly logLevel: string;
  readonly message: unknown;
}

const slowQueryMs = 101;
const slowQueryDuration = Duration.millis(slowQueryMs);

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

const query = 'SELECT * FROM users';

const slowDriver = Layer.effect(
  Driver,
  Effect.gen(function* () {
    const inner = yield* Driver;
    return Driver.of({
      dialect: inner.dialect,
      executeStream: inner.executeStream,
      executeRaw: (sql, params) =>
        Effect.gen(function* () {
          yield* Effect.sleep(slowQueryDuration);
          return yield* inner.executeRaw(sql, params);
        }),
    });
  }),
).pipe(Layer.provide(fastDriver));

const makeLogCollector = () => {
  const events: Array<LogEvent> = [];

  const loggerLayer = Logger.layer([
    Logger.make<unknown, void>(({ logLevel, message }) => {
      events.push({
        logLevel,
        message,
      });
    }),
  ]);

  return { loggerLayer, events };
};

const executeSlowQuery = (sql: string, duration: Duration.Input) =>
  Effect.gen(function* () {
    const db = yield* Driver;

    const queryFiber = yield* db.executeRaw(sql, []).pipe(Effect.forkChild);

    yield* TestClock.adjust(duration);
    return yield* Fiber.join(queryFiber);
  });

describe('SlowQueryLogLayer', () => {
  it.effect('logs a warning for a slow query', () => {
    const { loggerLayer, events } = makeLogCollector();

    return Effect.gen(function* () {
      const result = yield* executeSlowQuery(query, slowQueryDuration);

      expect(result).toEqual(rawResult);

      expect(events).toEqual([
        {
          logLevel: 'Warn',
          message: [query, slowQueryMs],
        },
      ]);
    }).pipe(
      Effect.provide([
        SlowQueryLogLayer().pipe(Layer.provide(slowDriver)),
        loggerLayer,
      ]),
    );
  });

  it.effect('does not log a warning for a fast query', () => {
    const { loggerLayer, events } = makeLogCollector();

    return Effect.gen(function* () {
      const db = yield* Driver;
      const result = yield* db.executeRaw(query, []);

      expect(events).toEqual([]);
      expect(result).toEqual(rawResult);
    }).pipe(
      Effect.provide([
        SlowQueryLogLayer().pipe(Layer.provide(fastDriver)),
        loggerLayer,
      ]),
    );
  });

  it.effect('does not log a query equal to the configured threshold', () => {
    const { loggerLayer, events } = makeLogCollector();

    return Effect.gen(function* () {
      const result = yield* executeSlowQuery(query, slowQueryDuration);

      expect(events).toEqual([]);
      expect(result).toEqual(rawResult);
    }).pipe(
      Effect.provide([
        SlowQueryLogLayer({ slowMs: slowQueryMs }).pipe(
          Layer.provide(slowDriver),
        ),
        loggerLayer,
      ]),
    );
  });
});
