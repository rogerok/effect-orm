import { Duration, Effect, Layer } from 'effect';

import { Driver } from '#drivers/driver.js';
import { StatementTimeoutError } from '#errors/errors.js';

interface StatementTimeoutOptions {
  timeoutMs: number;
}

export const StatementTimeoutLayer = ({ timeoutMs }: StatementTimeoutOptions) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const inner = yield* Driver;
      const duration = Duration.millis(timeoutMs);

      const timeoutEffect = (sql: string) =>
        Effect.gen(function* () {
          yield* Effect.sleep(duration);
          return yield* new StatementTimeoutError({ sql, timeoutMs });
        });

      return Driver.of({
        dialect: inner.dialect,
        executeRaw: (sql, params) =>
          Effect.raceFirst(inner.executeRaw(sql, params), timeoutEffect(sql)),
      });
    }),
  );
