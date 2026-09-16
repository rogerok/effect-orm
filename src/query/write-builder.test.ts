import { describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import { expect, expectTypeOf } from 'vitest';

import type { DriverImpl } from '#drivers/driver.js';
import type { InferReturning } from '#query/statements.js';

import { compile } from '#compiler/compiler.js';
import { expectFailure } from '#config/result-matchers.js';
import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { CodecError } from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { insertInto } from '#query/write-builders.js';
import {
  bool,
  integer,
  nullable,
  text,
  withCodec,
  withDefault,
} from '#schema/columns.js';
import { table } from '#schema/table.js';

import * as SqliteDriver from '../drivers/sqlite.js';

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

  it('typeof returning', () => {
    expectTypeOf<
      InferReturning<typeof users, readonly ['id', 'name']>
    >().toEqualTypeOf<ReadonlyArray<{ id: number; name: string }>>();
  });

  it('no execute property until values() called', () => {
    const insertQuery = insertInto(users);

    expectTypeOf<typeof insertQuery>().not.toHaveProperty('execute');
  });

  it('params order', () => {
    const insertQuery = insertInto(users).values([
      { id: 1, name: 'John' },
      { name: 'Ann', id: 2 },
    ]);

    const compiled = compile(insertQuery.toIR(), PgDialect);

    expect(compiled.sql).toEqual(
      `INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4)`,
    );

    expect(compiled.params).toEqual([1, 'John', 2, 'Ann']);
  });

  it('throw with default', () => {
    const t = table('users', {
      id: integer(),
      name: withDefault(text(), 'John'),
    });

    const insertQuery = insertInto(t).values([
      { id: 1, name: 'John' },
      { id: 2 },
    ]);

    expect(() => compile(insertQuery.toIR(), PgDialect)).toThrow(
      'INSERT row 1 has different columns: expected [id, name], received [id]',
    );
  });

  it.effect('returning', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;

      const usersReturning = table('users', {
        name: text(),
        id: integer(),
        age: integer(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${id('users')} (
              ${id('id')} ${db.dialect.mapColumnType('integer', {})}, 
              ${id('name')} ${db.dialect.mapColumnType('text', {})}, 
              ${id('age')} ${db.dialect.mapColumnType('integer', {})}
              )`,
        [],
      );

      const base = insertInto(usersReturning).values([
        { id: 1, name: 'John', age: 18 },
      ]);

      const selected = base.returning('id', 'name');
      const selectedResult = yield* selected.execute();

      expect(selectedResult).toEqual([{ id: 1, name: 'John' }]);
      expectTypeOf(selectedResult).toEqualTypeOf<
        readonly { id: number; name: string }[]
      >();

      const baseResult = yield* base.execute();
      expect(baseResult).toEqual({ affectedRows: 1 });
    }).pipe(Effect.provide(layer)),
  );

  // oxlint-disable-next-line vitest/expect-expect
  it('rejects unknown', () => {
    //@ts-expect-error there is no 'unknown' col in the table
    query.returning('unknown');
  });
});

const layer = SqliteDriver.layer({ path: ':memory:' });

describe('in memory test', () => {
  it.effect('inserts two rows with different property order', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;

      yield* db.executeRaw(
        `CREATE TABLE ${id('users')} (
              ${id('id')} ${db.dialect.mapColumnType('integer', {})}, ${id('name')} ${db.dialect.mapColumnType('text', {})}
              )`,
        [],
      );

      const insertResult = yield* insertInto(users)
        .values([
          { id: 1, name: 'John' },
          { name: 'Ann', id: 2 },
        ])
        .execute();

      expect(insertResult.affectedRows).toBe(2);

      const result = yield* selectFrom(users, 'u')
        .orderBy((b) => [{ dir: 'asc', expr: b.col('u', 'id') }])
        .selectAll()
        .execute();

      expect(result).toEqual([
        { id: 1, name: 'John' },
        { name: 'Ann', id: 2 },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('round trip', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');

      const flags = table('flags', {
        active: bool(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('active')} ${mapCol('integer', {})})`,
        [],
      );

      const insertQuery = insertInto(flags).values([{ active: true }]);
      const queryCopy = structuredClone(insertQuery.toIR());

      yield* insertQuery.execute();

      const active = yield* db.executeRaw(`SELECT * FROM ${tableId}`, []);

      const rows = yield* selectFrom(flags, 'f').selectAll().execute();

      expect(insertQuery.toIR()).toEqual(queryCopy);
      expect(rows).toEqual([{ active: true }]);
      expect(active.rows).toEqual([{ active: 1 }]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('null value', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');

      const flags = table('flags', {
        active: nullable(bool()),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('active')} ${mapCol('integer', {})})`,
        [],
      );

      yield* insertInto(flags)
        .values([{ active: null }])
        .execute();

      const active = yield* db.executeRaw(`SELECT * FROM ${tableId}`, []);

      const rows = yield* selectFrom(flags, 'f').selectAll().execute();

      expect(rows).toEqual([{ active: null }]);
      expect(active.rows).toEqual([{ active: null }]);
    }).pipe(Effect.provide(layer)),
  );
});

describe('encode', () => {
  it.effect('preserves encode failure details and leaves the table empty', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('posts');

      const encodeErr = new Error();

      const posts = table('posts', {
        label: withCodec(text(), () => ({
          encode: () => {
            throw encodeErr;
          },
          decode: (value: unknown) => `decoded:${String(value)}`,
        })),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('label')} ${mapCol('text', {})})`,
        [],
      );

      const insertQuery = insertInto(posts).values([{ label: 'true' }]);

      const result = yield* Effect.result(insertQuery.execute());

      const postsTable = yield* db.executeRaw(`SELECT * FROM ${tableId}`, []);

      expect(postsTable.rows).toEqual([]);
      expect(result).toBeFailure(CodecError);
      expect(expectFailure(result).cause).toBe(encodeErr);
      expect(expectFailure(result)).toMatchObject({
        column: 'label',
        value: 'true',
      });
    }).pipe(Effect.provide(layer)),
  );
});
