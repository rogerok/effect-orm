import { describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';

import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { getPostsByUserId } from '#hw/e2-6.js';

describe('E2.6 posts DataLoader', () => {
  it.effect('batches requests and groups posts by userId', () =>
    Effect.gen(function* () {
      let queryCounter = 0;

      const driver = Driver.of({
        dialect: PgDialect,
        executeStream: () => Stream.empty,
        executeRaw: () =>
          Effect.sync(() => {
            queryCounter += 1;

            return {
              affectedRows: 3,
              rows: [
                { id: 10, userId: 1, content: 'first' },
                { id: 11, userId: 1, content: 'second' },
                { id: 30, userId: 3, content: 'third' },
              ],
            };
          }),
      });
      const result = yield* Effect.forEach([1, 2, 3], getPostsByUserId, {
        concurrency: 'unbounded',
      }).pipe(Effect.provideService(Driver, driver));

      expect(queryCounter).toBe(1);
      expect(result[0]?.map((p) => p.id)).toEqual([10, 11]);
      expect(result[1]?.length).toBe(0);
      expect(result[2]?.map((p) => p.id)).toEqual([30]);
    }),
  );
});
