import { describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Stream } from 'effect';
import { expect, expectTypeOf } from 'vitest';

import type { DriverImpl } from '#drivers/driver.js';
import type { InferRow } from '#schema/infer.js';

import { expectFailure } from '#config/result-matchers.js';
import { SqliteDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import * as PGliteDriver from '#drivers/pglite.js';
import {
  CodecError,
  NotFoundError,
  OptimisticLockError,
  PrimaryKeyError,
  ReturningError,
  UniqueViolationError,
} from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { makeRepository } from '#repository/make-repository.js';
import {
  bool,
  integer,
  json,
  nullable,
  primaryKey,
  text,
  timestamp,
  withCodec,
  withDefault,
} from '#schema/columns.js';
import { table } from '#schema/table.js';
import { IdentityMapLayer } from '#uow/identity-map.js';

import * as SqliteDriver from '../drivers/sqlite.js';

const users = table('users', {
  id: primaryKey(integer()),
  name: text(),
  nickname: nullable(text()),
  age: withDefault(integer(), 18),
});

const sqliteLayer = SqliteDriver.layer({ path: ':memory:' });
const pgLayer = PGliteDriver.layer();

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
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
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
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
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
      }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer]));
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
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
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
          .pipe(
            Effect.provideService(Driver, driver),
            Effect.provide(IdentityMapLayer),
          ),
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

  it.effect('where codec error', () =>
    Effect.gen(function* () {
      const encodeErr = new Error();

      const posts = table('posts', {
        label: withCodec(text(), () => ({
          encode: () => {
            throw encodeErr;
          },
          decode: (value: unknown) => `decoded:${String(value)}`,
        })),
      });

      const db = yield* Driver;
      const ph = db.dialect.placeholder;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('posts');

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('label')} ${mapCol('text', {})})`,
        [],
      );

      yield* db.executeRaw(
        `INSERT INTO ${tableId} (${id('label')}) VALUES (${ph(1)})`,
        ['needle'],
      );

      const result = yield* Effect.result(
        selectFrom(posts, 'p')
          .where((b) => b.eq(b.col('p', 'label'), b.lit('needle')))
          .selectAll()
          .execute(),
      );

      expect(result).toBeFailure(CodecError);
      expect(expectFailure(result).cause).toBe(encodeErr);
      expect(expectFailure(result)).toMatchObject({
        column: 'label',
        value: 'needle',
      });
    }).pipe(Effect.provide(SqliteDriver.layer({ path: ':memory:' }))),
  );

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

  it.effect('codecs with boolean', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');
      const flags = table('flags', {
        id: primaryKey(integer()),
        active: bool(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('active')} ${mapCol('integer', {})}, ${id('id')} ${mapCol('integer', {})} PRIMARY KEY)`,
        [],
      );

      const repo = makeRepository(flags);

      const result = yield* repo.save({ id: 1, active: true });

      expect(result).toEqual({ id: 1, active: true });
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
  );

  it.effect('check bool with where', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');
      const flags = table('flags', {
        id: primaryKey(integer()),
        active: bool(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('active')} ${mapCol('boolean', {})}, ${id('id')} ${mapCol('integer', {})} PRIMARY KEY)`,
        [],
      );

      const repo = makeRepository(flags);
      yield* repo.save({ id: 1, active: true });
      yield* repo.save({ id: 2, active: false });

      const active = yield* repo.findBy({ active: true });
      const inactive = yield* repo.findBy({ active: false });

      expect(active).toEqual({ id: 1, active: true });
      expect(inactive).toEqual({ id: 2, active: false });
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
  );

  it.effect('encodes JSON on save and decodes the returned row', () => {
    const program = Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');
      const flags = table('flags', {
        id: primaryKey(integer()),
        payload: json<{ language: string }>(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('payload')} ${mapCol(flags._columns.payload._type, {})}, ${id('id')} ${mapCol('integer', {})} PRIMARY KEY)`,
        [],
      );

      const repo = makeRepository(flags);

      const obj = { id: 1, payload: { language: 'ru' } };

      const result = yield* repo.save(obj);
      const row = yield* db.executeRaw(`SELECT * FROM ${tableId}`, []);
      const byId = yield* repo.findById(1);

      expect(result).toEqual(obj);
      expect(byId).toEqual(obj);

      return { row };
    }).pipe(Effect.provide(IdentityMapLayer));

    return Effect.gen(function* () {
      const sql = yield* program.pipe(Effect.provide(sqliteLayer));
      const pg = yield* program.pipe(Effect.provide(pgLayer));

      expect(sql.row.rows[0]?.payload).toEqual('{"language":"ru"}');

      expect(pg.row.rows[0]?.payload).toEqual({ language: 'ru' });
    });
  });

  it.effect('encodes UPDATE values and decodes RETURNING', () =>
    Effect.gen(function* () {
      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapCol = db.dialect.mapColumnType;
      const tableId = id('flags');
      const flags = table('flags', {
        id: primaryKey(integer()),
        active: bool(),
      });

      yield* db.executeRaw(
        `CREATE TABLE ${tableId} (${id('active')} ${mapCol('integer', {})}, ${id('id')} ${mapCol('integer', {})} PRIMARY KEY)`,
        [],
      );

      const repo = makeRepository(flags);

      yield* repo.save({ id: 1, active: true });
      yield* repo.save({ id: 2, active: true });

      const updated = yield* repo.update(1, { active: false });
      const stored = yield* db.executeRaw(
        `SELECT ${id('id')}, ${id('active')}
             FROM ${tableId}
             ORDER BY ${id('id')}`,
        [],
      );

      expect(stored.rows).toEqual([
        { id: 1, active: 0 },
        { id: 2, active: 1 },
      ]);
      expect(updated).toEqual({ id: 1, active: false });
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
  );

  it.effect('preserves Date through save and findById', () => {
    const program = () =>
      Effect.gen(function* () {
        const db = yield* Driver;
        const id = db.dialect.quoteIdentifier;
        const mapCol = db.dialect.mapColumnType;
        const tableId = id('users');
        const usersTable = table('users', {
          id: primaryKey(integer()),
          createdAt: timestamp(),
        });

        yield* db.executeRaw(
          `CREATE TABLE ${tableId} (${id('createdAt')} ${mapCol(usersTable._columns.createdAt._type, {})}, ${id('id')} ${mapCol(usersTable._columns.id._type, {})} PRIMARY KEY)`,
          [],
        );

        const date = new Date('2026-01-02T03:04:05.000Z');

        const repo = makeRepository(usersTable);

        const result = yield* repo.save({ id: 1, createdAt: date });

        expect(result.createdAt).toEqual(date);

        const row = yield* repo.findById(1);
        expect(row?.createdAt).toEqual(date);
      });

    return Effect.gen(function* () {
      yield* program().pipe(Effect.provide([sqliteLayer, IdentityMapLayer]));
      yield* program().pipe(Effect.provide([pgLayer, IdentityMapLayer]));
    });
  });

  it.effect('reuses the cached row for repeated findById calls', () =>
    Effect.gen(function* () {
      let queryCount = 0;

      const driver = Driver.of({
        dialect: SqliteDialect,

        executeRaw: () =>
          Effect.sync(() => {
            queryCount += 1;

            return {
              affectedRows: 0,
              rows: [
                {
                  id: 1,
                  name: 'Anna',
                  nickname: null,
                  age: 18,
                },
              ],
            };
          }),
        executeStream: () => Stream.empty,
      });

      const program = Effect.gen(function* () {
        const repo = makeRepository(users);

        const first = yield* repo.findById(1);
        const second = yield* repo.findById(1);

        expect(first).toEqual({
          id: 1,
          name: 'Anna',
          nickname: null,
          age: 18,
        });

        expect(second).toBe(first);
      }).pipe(
        Effect.provideService(Driver, driver),
        Effect.provide(IdentityMapLayer),
      );

      yield* program;

      expect(queryCount).toBe(1);
    }),
  );

  it.effect('expected version', () =>
    Effect.gen(function* () {
      const usersTable = table('users', {
        id: primaryKey(integer()),
        name: text(),
        version: integer(),
      });

      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const mapColumnType = db.dialect.mapColumnType;
      yield* db.executeRaw(
        `CREATE TABLE ${id('users')} (
      ${id('id')} ${mapColumnType('integer', {})}  PRIMARY KEY,
      ${id('name')} ${mapColumnType('text', {})} NOT NULL,
      ${id('version')} ${mapColumnType('integer', {})} NOT NULL
    )`,
        [],
      );

      const repo = makeRepository(usersTable);

      const anna = yield* repo.save({ name: 'Anna', id: 1, version: 1 });

      const updateResult = yield* repo.update(
        1,
        { name: 'Boris' },
        { expectedVersion: 1 },
      );
      const updateResult2 = yield* Effect.result(
        repo.update(1, { name: 'Victor' }, { expectedVersion: 1 }),
      );

      const row = yield* repo.findBy({ id: anna.id });

      expect(updateResult2).toBeFailure(OptimisticLockError);
      expect(updateResult).toEqual({ name: 'Boris', id: 1, version: 2 });
      expect(row).toEqual({ name: 'Boris', id: 1, version: 2 });
    }).pipe(Effect.provide([sqliteLayer, IdentityMapLayer])),
  );
});
