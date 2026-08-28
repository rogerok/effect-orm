import { Effect, Layer } from 'effect';

import { Driver } from '#drivers/driver.js';
import { MetricLayer } from '#layers/metric.js';
import { TracingLayer } from '#layers/tracing.js';

import * as PGliteDriver from '../drivers/pglite.js';
import * as SqliteDriver from '../drivers/sqlite.js';

const program = Effect.gen(function* () {
  const db = yield* Driver;
  const ph = (n: number) => db.dialect.placeholder(n);
  const id = db.dialect.quoteIdentifier;

  yield* db.executeRaw(
    `CREATE TABLE IF NOT EXISTS ${id('users')} (
         id ${db.dialect.mapColumnType('integer', { autoIncrement: true })} PRIMARY KEY,
         name TEXT NOT NULL,
         email TEXT UNIQUE NOT NULL,
         active ${db.dialect.mapColumnType('boolean', { autoIncrement: false })} NOT NULL
     )`,
    [],
  );

  // На PGlite даст $1, $2, $3; на SQLite ?, ?, ?
  // bool(true) проходит через codec и становится `1` на SQLite
  const inserted = yield* db.executeRaw(
    `INSERT INTO ${id('users')} (name, email, active) VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}) RETURNING *`,
    ['Vassiliy', 'v@example.com', db.dialect.id === 'sqlite' ? 1 : true],
  );

  return inserted.rows;
}).pipe(
  Effect.catchTag('UniqueViolationError', (e) =>
    Effect.logWarning(`User already exists: ${e.constraint}`).pipe(
      Effect.as([]),
    ),
  ),
);

const sqliteLayer = MetricLayer.pipe(
  Layer.provide(
    TracingLayer.pipe(Layer.provide(SqliteDriver.layer({ path: ':memory' }))),
  ),
);

const pgLayer = MetricLayer.pipe(
  Layer.provide(TracingLayer.pipe(Layer.provide(PGliteDriver.layer({})))),
);

await Effect.runPromise(
  Effect.scoped(program).pipe(Effect.provide(sqliteLayer)),
);

await Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(pgLayer)));
