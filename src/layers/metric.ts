import { Effect, Layer, Metric } from 'effect';

import { Driver } from '#drivers/driver.js';
import { getOperation } from '#helpers/operation.js';

const queryTotalCounter = Metric.counter('db.queries.total', {
  incremental: true,
}).pipe(Metric.withConstantInput(1));

const metricTimer = Metric.timer('db.query.duration_ms');

const activeConnectionsGauge = Metric.gauge('db.connections.active');

export const MetricLayer = Layer.effect(
  Driver,
  Effect.gen(function* () {
    const inner = yield* Driver;

    yield* Effect.acquireRelease(Metric.modify(activeConnectionsGauge, 1), () =>
      Metric.modify(activeConnectionsGauge, -1),
    );

    return Driver.of({
      dialect: inner.dialect,
      executeRaw: (sql, params) =>
        Effect.gen(function* () {
          const currentQueriesTotal = queryTotalCounter.pipe(
            Metric.withAttributes({
              dialect: inner.dialect.id,
              op: getOperation(sql),
            }),
          );

          return yield* inner
            .executeRaw(sql, params)
            .pipe(
              Effect.trackDuration(metricTimer),
              Effect.track(currentQueriesTotal),
            );
        }),
    });
  }),
);
