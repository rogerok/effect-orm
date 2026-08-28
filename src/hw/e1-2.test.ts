import { describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Driver } from '#drivers/driver.js';
import * as LibsqlDriver from '#drivers/libsql.js';
import * as PGliteDriver from '#drivers/pglite.js';
import * as SqliteDriver from '#drivers/sqlite.js';
import {
  ConstraintCheckError,
  ConstraintCheckNotNullError,
} from '#errors/errors.js';

const pgLayer = Effect.provide(PGliteDriver.layer({}));
const sqliteLayer = Effect.provide(SqliteDriver.layer({ path: ':memory' }));
const libsqlLayer = Effect.provide(
  LibsqlDriver.layer({ url: 'file::memory:' }),
);

const programConstraintCheckError = Effect.gen(function* () {
  const driver = yield* Driver;
  const id = driver.dialect.quoteIdentifier;
  const ph = driver.dialect.placeholder;
  const tableId = id('products');

  yield* driver.executeRaw(
    `CREATE TABLE ${tableId} (${id('id')} ${driver.dialect.mapColumnType('integer', {})} PRIMARY KEY, ${id('price')} ${driver.dialect.mapColumnType('integer', {})}, CHECK (${id('price')} >= 0))`,
    [],
  );
  const result = yield* Effect.result(
    driver.executeRaw(
      `INSERT INTO ${tableId} (${id('id')}, ${id('price')}) VALUES (${ph(1)}, ${ph(2)})`,
      [1, -10],
    ),
  );
  expect(result._tag).toBe('Failure');
  if (result._tag === 'Failure')
    expect(result.failure).toBeInstanceOf(ConstraintCheckError);
});

const programConstraintCheckNotNullError = Effect.gen(function* () {
  const driver = yield* Driver;
  const id = driver.dialect.quoteIdentifier;
  const ph = driver.dialect.placeholder;
  const tableId = id('products');

  yield* driver.executeRaw(
    `CREATE TABLE ${tableId} (${id('id')} ${driver.dialect.mapColumnType('integer', {})} PRIMARY KEY, ${id('price')} ${driver.dialect.mapColumnType('integer', {})} NOT NULL)`,
    [],
  );
  const result = yield* Effect.result(
    driver.executeRaw(
      `INSERT INTO ${tableId} (${id('id')}) VALUES (${ph(1)})`,
      [1],
    ),
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

describe('E1.2 Libsql', () => {
  it.effect('ConstraintCheckError', () =>
    programConstraintCheckError.pipe(libsqlLayer),
  );

  it.effect('ConstraintCheckNotNullError', () =>
    programConstraintCheckNotNullError.pipe(libsqlLayer),
  );
});
