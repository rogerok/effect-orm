import { Context, Effect, Exit, Schedule } from 'effect';

import type { DriverError } from '#errors/errors.js';

import { Driver } from '#drivers/driver.js';

const TransactionDepth = Context.Reference<number>('our-orm/TransactionDepth', {
  defaultValue: () => 0,
});

export const withTransaction = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, DriverError | E, Driver | R> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const depth = yield* TransactionDepth;

    if (depth === 0) {
      return yield* Effect.acquireUseRelease(
        driver.executeRaw('BEGIN', []).pipe(Effect.as(undefined)),
        () => effect.pipe(Effect.provideService(TransactionDepth, 1)),
        (_, exit) =>
          Exit.isSuccess(exit)
            ? driver.executeRaw('COMMIT', []).pipe(Effect.orDie)
            : driver.executeRaw('ROLLBACK', []).pipe(Effect.orDie),
      );
    }

    //   SAVEPOINT

    const sp = `sp_${depth}_${Math.random().toString(36).slice(2, 8)}`;

    return yield* Effect.acquireUseRelease(
      driver.executeRaw(`SAVEPOINT ${sp}`, []).pipe(Effect.as(undefined)),
      () => effect.pipe(Effect.provideService(TransactionDepth, depth + 1)),
      (_, exit) =>
        Exit.isSuccess(exit)
          ? driver.executeRaw(`RELEASE SAVEPOINT ${sp}`, [])
          : driver
              .executeRaw(`ROLLBACK TO SAVEPOINT ${sp}`, [])
              .pipe(Effect.orDie),
    );
  });

const retryableTransaction = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  withTransaction(eff).pipe(
    Effect.retry({
      schedule: Schedule.exponential('100 millis'),
      times: 3,
      while: (e: unknown) =>
        (e as { _tag?: string })._tag === 'DbError' &&
        (e as { cause?: { code?: string } }).cause?.code === '40001',
    }),
  );
