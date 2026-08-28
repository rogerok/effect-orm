import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer, Metric } from 'effect';
import { TestClock } from 'effect/testing';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { MetricLayer } from '#layers/metric.js';

const driver = Layer.succeed(
  Driver,
  Driver.of({
    dialect: SqliteDialect,
    executeRaw: () =>
      Effect.sleep('100 millis').pipe(
        Effect.as({
          affectedRows: 0,
          rows: [],
        }),
      ),
  }),
);

const metricLayer = MetricLayer.pipe(Layer.provide(driver));

describe('driver metric', () => {
  it.effect('records query counter and duration histogram', () =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const db = yield* Driver;
        const executeQuery = (sql: string) =>
          Effect.gen(function* () {
            const queryFiber = yield* db
              .executeRaw(sql, [])
              .pipe(Effect.forkChild);

            yield* TestClock.adjust('100 millis');
            return yield* Fiber.join(queryFiber);
          });

        yield* executeQuery('SELECT * FROM users');
        yield* executeQuery('SELECT * FROM articles');
        yield* executeQuery('INSERT INTO users');

        const snapshot = yield* Metric.snapshot;

        const counters = snapshot.reduce<
          {
            count: bigint | number;
            dialect: string | undefined;
            op: string | undefined;
          }[]
        >((acc, metric) => {
          if (metric.id === 'db.queries.total' && metric.type === 'Counter') {
            acc.push({
              count: metric.state.count,
              dialect: metric.attributes?.dialect,
              op: metric.attributes?.op,
            });
          }
          return acc;
        }, []);

        expect(counters).toHaveLength(2);
        expect(counters).toEqual(
          expect.arrayContaining([
            {
              count: 1,
              dialect: 'sqlite',
              op: 'insert',
            },
            {
              count: 2,
              dialect: 'sqlite',
              op: 'select',
            },
          ]),
        );

        const durationMetric = snapshot.find(
          (metric) =>
            metric.id === 'db.query.duration_ms' && metric.type === 'Histogram',
        );

        expect(durationMetric?.state).toMatchObject({
          count: 3,
          max: 100,
          min: 100,
          sum: 300,
        });

        const activeMetric = snapshot.find(
          (metric) =>
            metric.id === 'db.connections.active' && metric.type === 'Gauge',
        );

        expect(activeMetric).toMatchObject({
          type: 'Gauge',
          state: {
            value: 1,
          },
        });
      }).pipe(Effect.provide(metricLayer));

      yield* program;

      const snapshot = yield* Metric.snapshot;
      const activeMetricAfter = snapshot.find(
        (metric) =>
          metric.id === 'db.connections.active' && metric.type === 'Gauge',
      );

      expect(activeMetricAfter).toMatchObject({
        type: 'Gauge',
        state: {
          value: 0,
        },
      });
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );
});
