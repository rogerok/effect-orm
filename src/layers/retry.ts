import { Duration, Effect, Layer, Match, Schedule } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { Driver } from '#drivers/driver.js';

interface RetryLayerOptions {
  exponentMs: number;
  maxAttempts: number;
}

const isTransientError = (error: DriverError) => {
  return Match.value(error).pipe(
    Match.tag('ConnectionFailureError', () => true),
    Match.tag('StatementTimeoutError', () => true),
    Match.tag('DatabaseBusyError', () => true),
    Match.orElse(() => false),
  );
};

export const RetryLayer = ({ maxAttempts, exponentMs }: RetryLayerOptions) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const inner = yield* Driver;

      return Driver.of({
        dialect: inner.dialect,
        executeRaw: (sql, params) =>
          inner.executeRaw(sql, params).pipe(
            Effect.retry({
              schedule: Schedule.exponential(Duration.millis(exponentMs)),
              times: maxAttempts - 1,
              while: isTransientError,
            }),
          ),
      });
    }),
  );
