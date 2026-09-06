import { describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';

import { Driver } from '#drivers/driver.js';
import * as Q from '#query/index.js';
import { streamFromSelect } from '#query/typed-stream.js';
import { integer } from '#schema/columns.js';
import { table } from '#schema/table.js';

import * as SqliteDriver from '../drivers/sqlite.js';

const layer = SqliteDriver.layer({ path: ':memory:' });

const totalsTable = table('totals', {
  amount: integer(),
});

describe('typed stream test', () => {
  it.effect('streams all SQLite rows and folds count and sum', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const ph = (n: number) => db.dialect.placeholder(n);

      yield* db.executeRaw(
        `CREATE TABLE ${id('totals')} (
              amount ${db.dialect.mapColumnType('integer', { autoIncrement: false })}
              )`,
        [],
      );

      yield* db.executeRaw(
        `WITH RECURSIVE seq(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < ${ph(1)}
      )
      INSERT INTO ${id('totals')}  (${id('amount')})
      SELECT n from seq
      `,
        [10],
      );

      const all = Q.selectAll(totalsTable);
      const stream = streamFromSelect(all, 2);
      const fold = Stream.runFold(
        stream,
        () => ({ sum: 0, count: 0 }),
        (acc, a) => ({ sum: acc.sum + a.amount, count: acc.count + 1 }),
      );

      const result = yield* fold;

      expect(result).toEqual({ count: 10, sum: 55 });
    }).pipe(Effect.provide(layer)),
  );
});
