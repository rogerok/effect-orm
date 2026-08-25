import { describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Driver } from '#drivers/driver.js';
import * as PGliteDriver from '#drivers/pglite.js';
import * as SqliteDriver from '#drivers/sqlite.js';
import {
  ConstraintCheckError,
  ConstraintCheckNotNullError,
} from '#errors/errors.js';

const pgLayer = Effect.provide(PGliteDriver.layer({}));
const sqliteLayer = Effect.provide(SqliteDriver.layer({ path: ':memory' }));

const programConstraintCheckError = Effect.gen(function* () {
  const driver = yield* Driver;
  yield* driver.executeRaw(
    `CREATE TABLE products (id INTEGER PRIMARY KEY, price INTEGER, CHECK (price >= 0))`,
    [],
  );
  const result = yield* Effect.result(
    driver.executeRaw(`INSERT INTO products (id, price) VALUES (1, -10)`, []),
  );
  expect(result._tag).toBe('Failure');
  if (result._tag === 'Failure')
    expect(result.failure).toBeInstanceOf(ConstraintCheckError);
});

const programConstraintCheckNotNullError = Effect.gen(function* () {
  const driver = yield* Driver;
  yield* driver.executeRaw(
    `CREATE TABLE products (id INTEGER PRIMARY KEY, price INTEGER NOT NULL)`,
    [],
  );
  const result = yield* Effect.result(
    driver.executeRaw(`INSERT INTO products (id) VALUES (1)`, []),
  );
  expect(result._tag).toBe('Failure');
  if (result._tag === 'Failure')
    expect(result.failure).toBeInstanceOf(ConstraintCheckNotNullError);
});

describe('E1.2 Pglite', () => {
  it.effect('ConstraintCheckError', () =>
    programConstraintCheckError.pipe(pgLayer),
  );

  it.effect('ConstraintCheckNotNullError', () =>
    programConstraintCheckNotNullError.pipe(pgLayer),
  );
});

describe('E1.2 Sqlite', () => {
  it.effect('ConstraintCheckError', () =>
    programConstraintCheckError.pipe(sqliteLayer),
  );

  it.effect('ConstraintCheckNotNullError', () =>
    programConstraintCheckNotNullError.pipe(sqliteLayer),
  );
});
