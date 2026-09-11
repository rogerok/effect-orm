import { describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Stream } from 'effect';
import { expect, expectTypeOf } from 'vitest';

import type { DriverImpl } from '#drivers/driver.js';
import type { InferRow } from '#schema/infer.js';

import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import {
  NotFoundError,
  PrimaryKeyError,
  ReturningError,
  UniqueViolationError,
} from '#errors/errors.js';
import { makeRepository } from '#query/make-repository.js';
import {
  integer,
  nullable,
  primaryKey,
  text,
  withDefault,
} from '#schema/columns.js';
import { table } from '#schema/table.js';

import * as SqliteDriver from '../drivers/sqlite.js';

const users = table('users', {
  id: primaryKey(integer()),
  name: text(),
  nickname: nullable(text()),
  age: withDefault(integer(), 18),
});

const layer = SqliteDriver.layer({ path: ':memory:' });

const createUsers = Effect.gen(function* () {
  const db = yield* Driver;
  const id = db.dialect.quoteIdentifier;

  yield* db.executeRaw(
    `CREATE TABLE ${id('users')} (
      ${id('id')} INTEGER PRIMARY KEY,
      ${id('name')} TEXT NOT NULL,
      ${id('nickname')} TEXT,
      ${id('age')} INTEGER NOT NULL DEFAULT 18
    )`,
    [],
  );
});

describe('makeRepository', () => {
  it.effect('reads rows by primary key and field criteria', () =>
    Effect.gen(function* () {
      yield* createUsers;
      const repo = makeRepository(users);

      const anna = yield* repo.save({ name: 'Anna', nickname: null });
      const boris = yield* repo.save({
        name: 'Boris',
        nickname: 'B',
        age: 22,
      });
      const anotherAnna = yield* repo.save({
        name: 'Anna',
        nickname: null,
        age: 30,
      });

      expect(anna).toEqual({ id: 1, name: 'Anna', nickname: null, age: 18 });
      expect(yield* repo.findById(1)).toEqual(anna);
      expect(yield* repo.findById(999)).toBeNull();
      expect(yield* repo.findBy({ name: 'Boris', age: 22 })).toEqual(boris);
      expect(yield* repo.findBy({ name: 'Boris', age: 30 })).toBeNull();
      expect(yield* repo.findMany({ nickname: null })).toEqual([
        anna,
        anotherAnna,
      ]);
      expect(yield* repo.findMany({ nickname: null, age: 30 })).toEqual([
        anotherAnna,
      ]);
      expect(yield* repo.findMany({ name: 'Nobody' })).toEqual([]);
      expect(yield* repo.findMany({})).toEqual([anna, boris, anotherAnna]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('updates and deletes only the selected row', () =>
    Effect.gen(function* () {
      yield* createUsers;
      const repo = makeRepository(users);
      const anna = yield* repo.save({ name: 'Anna', nickname: null });
      const boris = yield* repo.save({ name: 'Boris', nickname: 'B', age: 22 });

      const updated = yield* repo.update(anna.id, { age: 31, nickname: 'A' });
      expect(updated).toEqual({
        id: anna.id,
        name: 'Anna',
        nickname: 'A',
        age: 31,
      });
      expect(yield* repo.findById(boris.id)).toEqual(boris);

      const missingUpdate = yield* Effect.result(
        repo.update(999, { name: 'Missing' }),
      );
      expect(missingUpdate).toBeFailure(NotFoundError);

      expect(yield* repo.delete(anna.id)).toBeUndefined();
      expect(yield* repo.findById(anna.id)).toBeNull();
      expect(yield* repo.findById(boris.id)).toEqual(boris);
      expect(yield* repo.delete(anna.id)).toBeUndefined();
      expect(yield* repo.delete(999)).toBeUndefined();
    }).pipe(Effect.provide(layer)),
  );

  it.effect(
    'uses schema primary-key metadata instead of an id convention',
    () => {
      const accounts = table('accounts', {
        externalId: primaryKey(text()),
        id: integer(),
        name: text(),
      });
      const repo = makeRepository(accounts);

      return Effect.gen(function* () {
        const db = yield* Driver;
        yield* db.executeRaw(
          'CREATE TABLE accounts (externalId TEXT PRIMARY KEY, id INTEGER NOT NULL, name TEXT NOT NULL)',
          [],
        );

        const saved = yield* repo.save({
          externalId: 'account-17',
          id: 999,
          name: 'Anna',
        });
        expect(yield* repo.findById('account-17')).toEqual(saved);
        expect(yield* repo.update('account-17', { name: 'Changed' })).toEqual({
          externalId: 'account-17',
          id: 999,
          name: 'Changed',
        });
        expect(yield* repo.delete('account-17')).toBeUndefined();
        expect(yield* repo.findById('account-17')).toBeNull();
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('preserves driver failures', () =>
    Effect.gen(function* () {
      yield* createUsers;
      const repo = makeRepository(users);
      yield* repo.save({ id: 1, name: 'Anna', nickname: null });

      const duplicate = yield* Effect.result(
        repo.save({ id: 1, name: 'Duplicate', nickname: null }),
      );
      expect(duplicate).toBeFailure(UniqueViolationError);
    }).pipe(Effect.provide(layer)),
  );

  it('rejects a table without a primary key', () => {
    const logs = table('logs', { message: text() });

    expect(() => makeRepository(logs)).toThrow(PrimaryKeyError);
  });

  it.effect('treats an empty INSERT RETURNING result as a defect', () => {
    const driver: DriverImpl = {
      dialect: SqliteDialect,
      executeRaw: () =>
        Effect.succeed({
          affectedRows: 1,
          rows: [],
        }),
      executeStream: () => Stream.empty,
    };
    const repo = makeRepository(users);

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        repo
          .save({ name: 'Anna', nickname: null })
          .pipe(Effect.provideService(Driver, driver)),
      );

      expect(Exit.hasDies(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const defect = Cause.findDefect(exit.cause);
        expect(defect).toEqualSuccess(
          new ReturningError({
            cause: 'Expected INSERT RETURNING to return one row',
          }),
        );
      }
    });
  });

  it('exposes table-derived input and result types', () => {
    const repo = makeRepository(users);
    type User = InferRow<typeof users>;
    const saveEffect = repo.save({ name: 'Anna', nickname: null });
    const findByIdEffect = repo.findById(1);
    const findManyEffect = repo.findMany({});
    const deleteEffect = repo.delete(1);

    expectTypeOf<Effect.Success<typeof saveEffect>>().toEqualTypeOf<User>();
    expectTypeOf<
      Effect.Success<typeof findByIdEffect>
    >().toEqualTypeOf<User | null>();
    expectTypeOf<Effect.Success<typeof findManyEffect>>().toEqualTypeOf<
      ReadonlyArray<User>
    >();
    expectTypeOf<Effect.Success<typeof deleteEffect>>().toEqualTypeOf<void>();

    // @ts-expect-error numeric primary key rejects strings
    const invalidId = repo.findById('1');
    // @ts-expect-error update cannot change the primary key
    const invalidPatch = repo.update(1, { id: 2 });
    // @ts-expect-error age must remain numeric
    const invalidCriteria = repo.findMany({ age: '18' });
    // @ts-expect-error name is required on insert
    const invalidInsert = repo.save({ nickname: null });

    void [invalidId, invalidPatch, invalidCriteria, invalidInsert];
  });
});
