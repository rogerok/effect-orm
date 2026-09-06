import { Effect, Stream } from 'effect';

import { Driver } from '#drivers/driver.js';
import { selectAll } from '#query/index.js';
import { streamFromSelect } from '#query/typed-stream.js';
import { integer } from '#schema/columns.js';
import { table } from '#schema/table.js';

const rowCount = 1_000_000;

import { writeHeapSnapshot } from 'v8';

import * as SqliteDriver from '../drivers/sqlite.js';

const takeMeasurement = (name: 'after' | 'before') =>
  Effect.sync(() => {
    const gc = Reflect.get(globalThis, 'gc');
    if (typeof gc === 'function') {
      gc();
    }

    const memory = process.memoryUsage();
    const snapshotPath = writeHeapSnapshot(`/tmp/e2-7-${name}.heapsnapshot`);

    return { name, memory, snapshotPath };
  });

const layer = SqliteDriver.layer({ path: ':memory:' });

const program = Effect.gen(function* () {
  const totalsTable = table('totals', {
    amount: integer(),
  });

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
    `
    WITH RECURSIVE seq(n) AS (
      SELECT 1
      UNION ALL
      SELECT n + 1 FROM seq WHERE n < ${ph(1)}
    )
    INSERT INTO ${id('totals')}  (${id('amount')})
    SELECT n from seq
  `,
    [rowCount],
  );

  const before = yield* takeMeasurement('before');

  const all = selectAll(totalsTable);
  const stream = streamFromSelect(all, 2);
  const fold = Stream.runFold(
    stream,
    () => ({ sum: 0, count: 0 }),
    (acc, a) => ({ sum: acc.sum + a.amount, count: acc.count + 1 }),
  );

  const result = yield* fold;
  const after = yield* takeMeasurement('after');

  return { before, after, result };
}).pipe(Effect.provide(layer));

const result = await Effect.runPromise(program);

console.log(result);
