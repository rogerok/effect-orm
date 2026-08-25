import { Effect, Layer } from 'effect';

import { Driver } from '#drivers/driver.js';

export const TracingLayer = Layer.effect(
  Driver,
  Effect.gen(function* () {
    const inner = yield* Driver;
    return Driver.of({
      dialect: inner.dialect,
      executeRaw: (sql, params) =>
        Effect.gen(function* () {
          const result = yield* inner.executeRaw(sql, params);

          yield* Effect.annotateCurrentSpan({
            'db.rows.returned': result.rows.length,
            'db.rows.affected': result.affectedRows,
          });

          return result;
        }).pipe(
          Effect.withSpan('db.query', {
            attributes: {
              'db.system': inner.dialect.id,
              'db.statement': sql,
              'db.params.count': params.length,
            },
          }),
        ),
    });
  }),
);
