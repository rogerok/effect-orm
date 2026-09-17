import { describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Option, Pool } from 'effect';

import { makePool } from '#drivers/pglite.js';

describe('pglitePool', () => {
  it.effect('shares the database between checked-out resources', () =>
    Effect.gen(function* () {
      const pool = yield* makePool(2);

      const firstDriver = yield* Pool.get(pool);
      const tableId = firstDriver.dialect.quoteIdentifier('articles');

      yield* firstDriver.executeRaw(
        `CREATE TABLE ${tableId}
           (
             id
             ${firstDriver.dialect.mapColumnType('integer', { autoIncrement: true })}
             PRIMARY KEY UNIQUE,
             title TEXT UNIQUE
           )`,
        [],
      );

      const secondDriver = yield* Pool.get(pool);
      const result = yield* secondDriver.executeRaw(
        `INSERT INTO ${tableId} (title) VALUES (${secondDriver.dialect.placeholder(1)})`,
        ['title'],
      );

      expect(result).toMatchObject({
        affectedRows: 1,
      });
    }).pipe(Effect.scoped),
  );

  it.effect('reuses the PGlite instance after checkout scope closes', () =>
    Effect.gen(function* () {
      const pool = yield* makePool(1);

      const firstUse = Effect.gen(function* () {
        const driver = yield* Pool.get(pool);
        const tableId = driver.dialect.quoteIdentifier('articles');

        yield* driver.executeRaw(
          `CREATE TABLE ${tableId}
           (
             id
             ${driver.dialect.mapColumnType('integer', { autoIncrement: true })}
             PRIMARY KEY UNIQUE,
             title TEXT UNIQUE
           )`,
          [],
        );
      }).pipe(Effect.scoped);

      const secondUse = Effect.gen(function* () {
        const driver = yield* Pool.get(pool);

        const tableId = driver.dialect.quoteIdentifier('articles');

        return yield* driver.executeRaw(
          `INSERT INTO ${tableId} (title) VALUES (${driver.dialect.placeholder(1)})`,
          ['title'],
        );
      }).pipe(Effect.scoped);

      yield* firstUse;

      const result = yield* secondUse;

      expect(result).toMatchObject({
        affectedRows: 1,
      });
    }).pipe(Effect.scoped),
  );

  it.effect("waits for a free resource when the pool is full'", () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      const acquired = yield* Deferred.make<void>();
      const thirdAcquired = yield* Deferred.make<void>();

      const pool = yield* makePool(2);
      yield* Pool.get(pool);

      const holdSecond = Effect.gen(function* () {
        yield* Pool.get(pool);
        yield* Deferred.succeed(acquired, undefined);
        yield* Deferred.await(release);
      }).pipe(Effect.scoped);

      const holdThird = Effect.gen(function* () {
        yield* Pool.get(pool);
        yield* Deferred.succeed(thirdAcquired, undefined);
      }).pipe(Effect.scoped);

      const secondPoolFiber = yield* Effect.forkChild(holdSecond);
      yield* Deferred.await(acquired);

      const thirdPoolFiber = yield* Effect.forkChild(holdThird, {
        startImmediately: true,
      });
      const thirdStatus = yield* Deferred.poll(thirdAcquired);
      expect(Option.isNone(thirdStatus)).toBe(true);

      yield* Deferred.succeed(release, undefined);

      yield* Fiber.join(secondPoolFiber);
      yield* Fiber.join(thirdPoolFiber);
    }).pipe(Effect.scoped),
  );
});
