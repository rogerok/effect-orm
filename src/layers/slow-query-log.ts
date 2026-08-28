import { Duration, Effect, Layer } from 'effect';

import { Driver } from '#drivers/driver.js';

interface SlowQueryLogOptions {
  slowMs?: number;
}

export const SlowQueryLogLayer = (options?: SlowQueryLogOptions) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const inner = yield* Driver;
      const slowMs = options?.slowMs ?? 100;
      return Driver.of({
        dialect: inner.dialect,
        executeRaw: (sql, params) =>
          Effect.gen(function* () {
            const [duration, result] = yield* Effect.timed(
              inner.executeRaw(sql, params),
            );
            const ms = Duration.toMillis(duration);

            if (ms > slowMs) {
              yield* Effect.logWarning(sql, ms);
            }

            return result;
          }),
      });
    }),
  );
