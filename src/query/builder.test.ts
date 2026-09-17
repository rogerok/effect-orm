import { describe, it } from '@effect/vitest';
import { Effect, Option, Stream } from 'effect';
import { expect, expectTypeOf } from 'vitest';

import type { DriverImpl } from '#drivers/driver.js';

import { expectFailure } from '#config/result-matchers.js';
import { PgDialect } from '#dialect.js';
import { Driver } from '#drivers/driver.js';
import { CodecError, NotFoundError } from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { insertInto } from '#query/write-builders.js';
import {
  bool,
  integer,
  json,
  nullable,
  text,
  withCodec,
} from '#schema/columns.js';
import { table } from '#schema/table.js';

import * as PGliteDriver from '../drivers/pglite.js';
import * as SqliteDriver from '../drivers/sqlite.js';

const makeDriver = (rows: ReadonlyArray<Record<string, unknown>>) => {
  let calls = 0;

  const driver: DriverImpl = {
    dialect: PgDialect,
    executeStream: () => Stream.empty,
    executeRaw: () =>
      Effect.sync(() => {
        calls += 1;

        return { affectedRows: 0, rows };
      }),
  };

  return { driver, calls: () => calls };
};
const users = table('users', { id: integer(), name: text() });
const query = selectFrom(users, 'u').select((b) => ({
  id: b.col('u', 'id'),
  name: b.col('u', 'name'),
}));

describe('builder', () => {
  it.effect('execute', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([{ id: 1, name: 'first' }]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([{ id: 1, name: 'first' }]);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('execute 0 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([]);
    }),
  );

  it.effect('execute 2 rows', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);

      const result = yield* Effect.result(
        query.execute().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('executeOne 0 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([]);

      const result = yield* Effect.result(
        query.executeOne().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess(Option.none());
    }),
  );

  it.effect('executeOne 2 rows', () =>
    Effect.gen(function* () {
      const rows = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ];

      const { driver } = makeDriver(rows);

      const result = yield* Effect.result(
        query.executeOne().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toEqualSuccess(Option.some(rows[0]!));
    }),
  );

  it.effect('executeOneOrThrow 0 rows', () =>
    Effect.gen(function* () {
      const { driver, calls } = makeDriver([]);

      const result = yield* Effect.result(
        query.executeOneOrThrow().pipe(Effect.provideService(Driver, driver)),
      );

      expect(result).toBeFailure(NotFoundError);
      expect(calls()).toEqual(1);
    }),
  );

  it.effect('executeOneOrThrow 2 rows', () =>
    Effect.gen(function* () {
      const { driver } = makeDriver([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);

      const result = yield* Effect.result(
        query.executeOneOrThrow().pipe(Effect.provideService(Driver, driver)),
      );

      expect(expectFailure(result)).toMatchObject({
        _tag: 'TooManyError',
        count: 2,
      });
    }),
  );
});

const flags = table('flags', {
  id: integer(),
  active: nullable(bool()),
  parentId: nullable(integer()),
});
const sqliteLayer = SqliteDriver.layer({ path: ':memory:' });
const createFlags = Effect.gen(function* () {
  const db = yield* Driver;
  yield* db.executeRaw(
    'CREATE TABLE flags (id INTEGER, active INTEGER, "parentId" INTEGER)',
    [],
  );
  yield* db.executeRaw(
    'INSERT INTO flags VALUES (1, 0, 2), (2, 1, NULL), (3, NULL, 1)',
    [],
  );
});

describe('builder codecs (E3.5)', () => {
  it.effect(
    'decodes aliased columns while preserving literals and columns without codecs',
    () =>
      Effect.gen(function* () {
        yield* createFlags;
        const rows = yield* selectFrom(flags, 'f')
          .orderBy((b) => [{ expr: b.col('f', 'id'), dir: 'asc' }])
          .select((b) => ({
            marker: b.lit(0),
            number: b.col('f', 'id'),
            enabled: b.col('f', 'active'),
            alsoEnabled: b.col('f', 'active'),
          }))
          .execute();

        expect(rows).toEqual([
          { marker: 0, number: 1, enabled: false, alsoEnabled: false },
          { marker: 0, number: 2, enabled: true, alsoEnabled: true },
          { marker: 0, number: 3, enabled: null, alsoEnabled: null },
        ]);
        expectTypeOf(rows).toEqualTypeOf<
          ReadonlyArray<{
            alsoEnabled: boolean | null;
            enabled: boolean | null;
            marker: number;
            number: number;
          }>
        >();
      }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect(
    'selectAll decodes nullable columns and preserves empty results',
    () =>
      Effect.gen(function* () {
        yield* createFlags;
        const rows = yield* selectFrom(flags, 'f')
          .orderBy((b) => [{ expr: b.col('f', 'id'), dir: 'asc' }])
          .selectAll()
          .execute();

        expect(rows).toEqual([
          { id: 1, active: false, parentId: 2 },
          { id: 2, active: true, parentId: null },
          { id: 3, active: null, parentId: 1 },
        ]);

        const empty = selectFrom(flags, 'f')
          .where((b) => b.eq(b.col('f', 'id'), b.lit(99)))
          .selectAll();

        expect(yield* empty.execute()).toEqual([]);
        expect(yield* empty.executeOne()).toEqual(Option.none());
      }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect('single-row terminals return decoded values', () =>
    Effect.gen(function* () {
      yield* createFlags;
      const selected = selectFrom(flags, 'f')
        .where((b) => b.eq(b.col('f', 'id'), b.lit(1)))
        .select((b) => ({ enabled: b.col('f', 'active') }));

      expect(yield* selected.executeOne()).toEqual(
        Option.some({ enabled: false }),
      );
      expect(yield* selected.executeOneOrThrow()).toEqual({ enabled: false });
    }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect(
    'decodes both aliases in self joins and preserves missing LEFT JOIN rows',
    () =>
      Effect.gen(function* () {
        yield* createFlags;
        const base = selectFrom(flags, 'f').orderBy((b) => [
          { expr: b.col('f', 'id'), dir: 'asc' },
        ]);
        const inner = yield* base
          .innerJoin(flags, 'parent', (b) =>
            b.eq(b.col('f', 'parentId'), b.col('parent', 'id')),
          )
          .select((b) => ({
            id: b.col('f', 'id'),
            enabled: b.col('f', 'active'),
            parentId: b.col('parent', 'id'),
            parentEnabled: b.col('parent', 'active'),
          }))
          .execute();

        expect(inner).toEqual([
          { id: 1, enabled: false, parentId: 2, parentEnabled: true },
          { id: 3, enabled: null, parentId: 1, parentEnabled: false },
        ]);

        const left = yield* base
          .leftJoin(flags, 'parent', (b) =>
            b.eq(b.col('f', 'parentId'), b.col('parent', 'id')),
          )
          .select((b) => ({
            id: b.col('f', 'id'),
            enabled: b.col('f', 'active'),
            parentId: b.col('parent', 'id'),
            parentEnabled: b.col('parent', 'active'),
          }))
          .execute();

        expect(left).toEqual([
          { id: 1, enabled: false, parentId: 2, parentEnabled: true },
          { id: 2, enabled: true, parentId: null, parentEnabled: null },
          { id: 3, enabled: null, parentId: 1, parentEnabled: false },
        ]);
      }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect(
    'decodes only selected JSON fields and reports the failing field and raw value',
    () =>
      Effect.gen(function* () {
        const documents = table('documents', {
          id: integer(),
          payload: nullable(json<{ language: string }>()),
        });
        const db = yield* Driver;
        yield* db.executeRaw(
          'CREATE TABLE documents (id INTEGER, payload TEXT)',
          [],
        );
        yield* db.executeRaw(
          'INSERT INTO documents VALUES (1, ?), (2, NULL), (3, ?)',
          ['{"language":"ru"}', 'not-json'],
        );

        const ids = yield* selectFrom(documents, 'd')
          .orderBy((b) => [{ expr: b.col('d', 'id'), dir: 'asc' }])
          .select((b) => ({ id: b.col('d', 'id') }))
          .execute();
        expect(ids).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

        const valid = yield* selectFrom(documents, 'd')
          .where((b) => b.lt(b.col('d', 'id'), b.lit(3)))
          .orderBy((b) => [{ expr: b.col('d', 'id'), dir: 'asc' }])
          .select((b) => ({ preferences: b.col('d', 'payload') }))
          .execute();
        expect(valid).toEqual([
          { preferences: { language: 'ru' } },
          { preferences: null },
        ]);

        const invalid = yield* Effect.result(
          selectFrom(documents, 'd')
            .where((b) => b.eq(b.col('d', 'id'), b.lit(3)))
            .select((b) => ({ preferences: b.col('d', 'payload') }))
            .execute(),
        );
        expect(invalid).toBeFailure(CodecError);
        expect(expectFailure(invalid)).toMatchObject({
          column: 'preferences',
          value: 'not-json',
          cause: expect.any(SyntaxError),
        });
      }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect(
    'chooses codecs from the executing driver when reusing a query across dialects',
    () => {
      const documents = table('documents', {
        active: bool(),
        payload: json<{ language: string }>(),
      });
      const selected = selectFrom(documents, 'd').select((b) => ({
        enabled: b.col('d', 'active'),
        preferences: b.col('d', 'payload'),
      }));
      const check = Effect.gen(function* () {
        const db = yield* Driver;
        const payloadType = db.dialect.id === 'postgres' ? 'JSONB' : 'TEXT';
        yield* db.executeRaw(
          `CREATE TABLE documents (active BOOLEAN, payload ${payloadType})`,
          [],
        );
        yield* db.executeRaw(
          `INSERT INTO documents VALUES (TRUE, ${db.dialect.placeholder(1)})`,
          ['{"language":"ru"}'],
        );

        expect(yield* selected.execute()).toEqual([
          { enabled: true, preferences: { language: 'ru' } },
        ]);
      });

      return Effect.gen(function* () {
        yield* check.pipe(Effect.provide(sqliteLayer));
        yield* check.pipe(Effect.provide(PGliteDriver.layer()));
      });
    },
  );

  it.effect(
    'does not mutate driver rows or decode them twice on repeated execution',
    () => {
      const labels = table('labels', {
        label: withCodec(text(), () => ({
          encode: (value: string) => value,
          decode: (value: unknown) => `decoded:${String(value)}`,
        })),
      });
      const { driver } = makeDriver([Object.freeze({ label: 'stored' })]);
      const selected = selectFrom(labels, 'l').selectAll();

      return Effect.gen(function* () {
        expect(yield* selected.execute()).toEqual([
          { label: 'decoded:stored' },
        ]);
        expect(yield* selected.execute()).toEqual([
          { label: 'decoded:stored' },
        ]);
      }).pipe(Effect.provideService(Driver, driver));
    },
  );

  it.effect('encodes JOIN ON and WHERE together', () =>
    Effect.gen(function* () {
      const users = table('users', {
        id: integer(),
        active: bool(),
      });
      const orders = table('orders', {
        id: integer(),
        userId: integer(),
        paid: bool(),
      });

      const db = yield* Driver;
      const id = db.dialect.quoteIdentifier;
      const ph = db.dialect.placeholder;
      const mapCol = db.dialect.mapColumnType;

      yield* db.executeRaw(
        `CREATE TABLE ${id('users')} (
        ${id('id')} ${mapCol('integer', {})},
        ${id('active')} ${mapCol('integer', {})}
  )`,
        [],
      );

      yield* db.executeRaw(
        `CREATE TABLE ${id('orders')} (
        ${id('id')} ${mapCol('integer', {})},
        ${id('userId')} ${mapCol('integer', {})},
        ${id('paid')} ${mapCol('integer', {})}
      )`,
        [],
      );

      yield* db.executeRaw(
        `INSERT INTO ${id('users')} (${id('id')}, ${id('active')})
            VALUES (${ph(1)}, ${ph(2)}), (${ph(3)}, ${ph(4)})`,
        [1, 1, 2, 0],
      );

      yield* db.executeRaw(
        `INSERT INTO ${id('orders')} (
        ${id('id')}, ${id('userId')}, ${id('paid')}
        )
        VALUES
          (${ph(1)}, ${ph(2)}, ${ph(3)}),
          (${ph(4)}, ${ph(5)}, ${ph(6)}),
          (${ph(7)}, ${ph(8)}, ${ph(9)})`,
        [10, 1, 1, 11, 1, 0, 12, 2, 1],
      );

      const rows = yield* selectFrom(users, 'u')
        .innerJoin(orders, 'o', (b) =>
          b.and(
            b.eq(b.col('u', 'id'), b.col('o', 'userId')),
            b.eq(b.col('o', 'paid'), b.lit(true)),
          ),
        )
        .where((b) => b.eq(b.col('u', 'active'), b.lit(true)))
        .select((b) => ({ id: b.col('o', 'id') }))
        .execute();

      expect(rows).toEqual([{ id: 10 }]);
    }).pipe(Effect.provide(sqliteLayer)),
  );

  it.effect(
    'optimizes WHERE while preserving boolean encoding and decoding',
    () =>
      Effect.gen(function* () {
        const flags = table('optimized_flags', {
          id: integer(),
          active: bool(),
        });

        const db = yield* Driver;

        yield* db.executeRaw(
          'CREATE TABLE optimized_flags (id INTEGER, active INTEGER)',
          [],
        );

        yield* insertInto(flags)
          .values([
            { id: 1, active: false },
            { id: 2, active: true },
          ])
          .execute();

        const observedDriver = Driver.of({
          dialect: db.dialect,
          executeStream: db.executeStream,
          executeRaw: (sql, params, options) =>
            Effect.gen(function* () {
              expect(sql).not.toMatch(/\bTRUE\b/i);
              expect(params).toEqual([1]);

              return yield* db.executeRaw(sql, params, options);
            }),
        });

        const rows = yield* selectFrom(flags, 'f')
          .where((b) => b.and(b.and(), b.eq(b.col('f', 'active'), b.lit(true))))
          .select((b) => ({
            id: b.col('f', 'id'),
            active: b.col('f', 'active'),
          }))
          .execute()
          .pipe(Effect.provideService(Driver, observedDriver));

        expect(rows).toEqual([{ id: 2, active: true }]);
      }).pipe(Effect.provide(sqliteLayer)),
  );
});
