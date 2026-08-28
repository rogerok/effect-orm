import { describe, it } from '@effect/vitest';
import { Effect, Result } from 'effect';

import { Driver } from '#drivers/driver.js';
import * as LibsqlDriver from '#drivers/libsql.js';
import { UniqueViolationError } from '#errors/errors.js';

const libsql = Effect.provide(LibsqlDriver.layer({ url: 'file::memory:' }));

describe('Libsql Driver', () => {
  it.effect('executes writes and reads using a file URL', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const ph = db.dialect.placeholder;
      const tableId = id('articles');

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('id')} ${db.dialect.mapColumnType('integer', { autoIncrement: true })} PRIMARY KEY, ${id('title')} ${db.dialect.mapColumnType('text', {})})`,
        [],
      );

      const insertResult = yield* db.executeRaw(
        `INSERT INTO ${tableId} (${id('title')}) VALUES (${ph(1)})`,
        ['title'],
      );

      const selectResult = yield* db.executeRaw(
        `SELECT ${id('id')}, ${id('title')} FROM ${tableId} WHERE ${id('id')} = ${ph(1)}`,
        [1],
      );

      expect(selectResult).toEqual({
        affectedRows: 0,
        rows: [{ id: 1, title: 'title' }],
      });

      expect(insertResult).toMatchObject({
        affectedRows: 1,
        lastInsertRowId: 1n,
      });
    }).pipe(libsql),
  );

  it.effect('maps unique constraint failure', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const ph = db.dialect.placeholder;
      const tableId = id('articles');
      const insertSql = `INSERT INTO ${tableId} (${id('title')}) VALUES (${ph(1)})`;

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('id')} ${db.dialect.mapColumnType('integer', { autoIncrement: true })} PRIMARY KEY, ${id('title')} ${db.dialect.mapColumnType('text', {})} UNIQUE)`,
        [],
      );

      yield* db.executeRaw(insertSql, ['title']);
      const result = yield* Effect.result(db.executeRaw(insertSql, ['title']));

      expect(Result.isFailure(result)).toBe(true);

      if (Result.isSuccess(result)) {
        throw new Error('Expect failure');
      }

      expect(result.failure).toBeInstanceOf(UniqueViolationError);
      expect(result.failure).toMatchObject({
        _tag: 'UniqueViolationError',
        sql: insertSql,
        constraint: 'articles.title',
      });
    }).pipe(libsql),
  );
});
