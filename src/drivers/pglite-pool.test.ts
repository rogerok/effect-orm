import { describe, it } from '@effect/vitest';
import { Effect, Pool } from 'effect';

import { makePool } from '#drivers/pglite.js';

describe('pglitePool', () => {
  it.effect('', () =>
    Effect.gen(function* () {
      const pool = yield* makePool(1);
      const driver = yield* Effect.scoped(Pool.get(pool));
      const id = driver.dialect.quoteIdentifier;
      const ph = driver.dialect.placeholder;

      const tableId = id('articles');

      yield* driver.executeRaw(
        `CREATE TABLE IF NOT exists ${tableId} (
         id ${driver.dialect.mapColumnType('integer', { autoIncrement: true })} PRIMARY KEY UNIQUE,
            title TEXT UNIQUE
         )`,
        [],
      );

      yield* driver.executeRaw(
        `INSERT INTO ${tableId} (title) VALUES (${ph(1)})`,
        ['title'],
      );
    }).pipe(Effect.scoped),
  );
});
