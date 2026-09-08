import { describe, it } from '@effect/vitest';
import { Effect, Option, Stream } from 'effect';

import type { DriverImpl } from '#drivers/driver.js';

import { expectFailure } from '#config/result-matchers.js';
import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { NotFoundError } from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { integer, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

const makeDriver = (rows: ReadonlyArray<Record<string, unknown>>) => {
  let calls = 0;

  const driver: DriverImpl = {
    dialect: PgDialect,
    executeStream: () => Stream.empty,
    executeRaw: () =>
      Effect.sync(() => {
        calls += 1;

        return { affectedRows: 0, rows };
      }),
  };

  return { driver, calls: () => calls };
};
const users = table('users', { id: integer(), name: text() });
const query = selectFrom(users, 'u').select((b) => ({
  id: b.col('u', 'id'),
  name: b.col('u', 'name'),
}));

describe('builder', () => {
  it.effect('execute', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([{ id: 1, name: 'first' }]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([{ id: 1, name: 'first' }]);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('execute 0 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([]);
    }),
  );

  it.effect('execute 2 rows', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('executeOne 0 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([]);

      const result = yield* Effect.result(
        query.executeOne().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess(Option.none());
    }),
  );

  it.effect('executeOne 2 rows', () =>
    Effect.gen(function* () {
      const rows = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ];

      const { driver } = makeDriver(rows);

      const result = yield* Effect.result(
        query.executeOne().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess(Option.some(rows[0]!));
    }),
  );

  it.effect('executeOneOrThrow 0 rows', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([]);

      const result = yield* Effect.result(
        query.executeOneOrThrow().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toBeFailure(NotFoundError);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('executeOneOrThrow 2 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);

      const result = yield* Effect.result(
        query.executeOneOrThrow().pipe(Effect.provideService(Driver, driver)),
      );

      expect(expectFailure(result)).toMatchObject({
        _tag: 'TooManyError',
        count: 2,
      });
    }),
  );
});
