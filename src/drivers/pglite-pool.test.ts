import { describe, it } from '@effect/vitest';
import { Effect, Pool } from 'effect';

import { makePool } from '#drivers/pglite.js';

describe('pglitePool', () => {
  it.effect('', () =>
    Effect.gen(function* () {
      const pool = yield* makePool(1);
      const driver = yield* Effect.scoped(Pool.get(pool));

      yield* driver.executeRaw(
        'CREATE TABLE articles (id INTEGER primary key UNIQUE, title TEXT UNIQUE)',
        [],
      );
      yield* driver.executeRaw('INSERT INTO articles (title) VALUES $1', [
        'title',
      ]);
    }).pipe(Effect.scoped),
  );
});
