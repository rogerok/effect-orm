import { Context, Effect, Exit } from 'effect';

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
