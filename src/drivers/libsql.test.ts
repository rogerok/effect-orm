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

      yield* db.executeRaw(
        `CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT)`,
        [],
      );

      const insertResult = yield* db.executeRaw(
        `INSERT INTO articles (title) VALUES (?)`,
        ['title'],
      );

      const selectResult = yield* db.executeRaw(
        `SELECT id, title FROM articles WHERE id = ?`,
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

      yield* db.executeRaw(
        `CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT UNIQUE)`,
        [],
      );

      yield* db.executeRaw(`INSERT INTO articles (title) VALUES (?)`, [
        'title',
      ]);
      const result = yield* Effect.result(
        db.executeRaw(`INSERT INTO articles (title) VALUES (?)`, ['title']),
      );

      expect(Result.isFailure(result)).toBe(true);

      if (Result.isSuccess(result)) {
        throw new Error('Expect failure');
      }

      expect(result.failure).toBeInstanceOf(UniqueViolationError);
      expect(result.failure).toMatchObject({
        _tag: 'UniqueViolationError',
        sql: 'INSERT INTO articles (title) VALUES (?)',
        constraint: 'articles.title',
      });
    }).pipe(libsql),
  );
});
