import { describe, it } from '@effect/vitest';
import { Effect, Pool } from 'effect';

import { makePool } from '#drivers/pglite.js';

describe('pglitePool', () => {
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
});
