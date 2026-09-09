import { describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import { expect, expectTypeOf } from 'vitest';

import type { DriverImpl } from '#drivers/driver.js';

import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { insertInto } from '#query/write-builders.js';
import { integer, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

const makeDriver = (
  rows: ReadonlyArray<Record<string, unknown>>,
  affectedRows: number,
): DriverImpl => ({
  dialect: PgDialect,
  executeStream: () => Stream.empty,
  executeRaw: () =>
    Effect.sync(() => ({
      affectedRows,
      rows,
    })),
});

const users = table('users', { id: integer(), name: text() });

const query = insertInto(users).values([{ id: 1, name: 'John' }]);
type InsertResult = Effect.Success<ReturnType<typeof query.execute>>;

describe('write builder', () => {
  it.effect('INSERT without RETURNING returns affectedRows', () =>
    Effect.gen(function* () {
      const driver = makeDriver([], 1);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess({ affectedRows: 1 });
      expectTypeOf<InsertResult>().toEqualTypeOf<{
        readonly affectedRows: number;
      }>();
    }),
  );

  it('no execute property until values() called', () => {
    const insertQuery = insertInto(users);

    expectTypeOf<typeof insertQuery>().not.toHaveProperty('execute');
  });
});
