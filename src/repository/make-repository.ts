import { Array, Effect, Option } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { ExpressionBuilder, Source } from '#query/expression-builder.js';
import type { Expr, Pred } from '#query/typed-ast.js';
import type { InferInsert, InferRow, InferUpdate } from '#schema/infer.js';
import type { IdentityBaseKey } from '#uow/identity-map.js';

import {
  NotFoundError,
  OptimisticLockError,
  PrimaryKeyError,
  QueryInvariantError,
  ReturningError,
} from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import {
  deleteFrom,
  insertInto,
  update as updateBuilder,
} from '#query/write-builders.js';
import { type AnyTableDef } from '#schema/table.js';
import { IdentityMapTag } from '#uow/identity-map.js';

type PrimaryKeyName<T extends AnyTableDef> = {
  [K in keyof T['_columns'] & string]: T['_columns'][K]['_pk'] extends true
    ? K
    : never;
}[keyof T['_columns'] & string];

interface MakeRepositoryOptions {
  readonly alias?: string;
}

interface RepoUpdateOptions {
  expectedVersion?: number | undefined;
}

const criteriaToPred = <T extends AnyTableDef>(
  criteria: Partial<InferRow<T>>,
  b: ExpressionBuilder<Record<string, Source<T, false>>>,
  alias: string,
): Pred =>
  b.and(
    ...Object.entries(criteria).reduce<Array<Pred>>((acc, [k, v]) => {
      if (v === undefined) {
        return acc;
      }

      if (v === null) {
        acc.push(b.isNull(b.col(alias, k)));
      } else {
        acc.push(b.eq(b.col(alias, k), b.lit(v)));
      }

      return acc;
    }, []),
  );

const findPrimaryKey = <T extends AnyTableDef>(table: T): PrimaryKeyName<T> => {
  const entries = Object.entries(table._columns);
  const pk = entries[entries.findIndex(([__, v]) => v._pk)]?.[0];

  if (pk === undefined) {
    //отсутствие первичного ключа можно считать нарушением предусловия фабрики: репозиторий требует таблицу с первичным ключом.
    throw new PrimaryKeyError({
      cause: 'Primary key should exist in the table',
    });
  }

  return pk as PrimaryKeyName<T>;
};

export const makeRepository = <T extends AnyTableDef>(
  t: T,
  options?: MakeRepositoryOptions,
) => {
  const alias = options?.alias ?? t._name;
  const pk = findPrimaryKey(t);
  const colNames = Object.keys(t._columns) as ReadonlyArray<
    keyof InferRow<T> & string
  >;

  const selectQb = selectFrom(t, alias);
  const insertQb = insertInto(t);
  const deleteQb = deleteFrom(t);
  const updateQb = updateBuilder(t);

  const del = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
  ): Effect.Effect<void, DriverError, Driver | IdentityMapTag> =>
    Effect.gen(function* () {
      const map = yield* IdentityMapTag;

      yield* deleteQb
        .where((b) => b.eq(b.col(t._name, pk), b.lit(id)))
        .execute();

      yield* map.invalidate(t._name, id);
    });

  const update = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
    rows: InferUpdate<T>,
    updateOptions: RepoUpdateOptions = {},
  ): Effect.Effect<
    InferRow<T>,
    DriverError | NotFoundError | OptimisticLockError,
    Driver | IdentityMapTag
  > =>
    Effect.gen(function* () {
      let currentRows = rows;
      let nextVersion: number | undefined = undefined;
      const versionColumn = t._columns['version'];

      if (updateOptions.expectedVersion !== undefined) {
        if (
          versionColumn?._nullable ||
          versionColumn?._pk ||
          versionColumn?._type !== 'integer' ||
          versionColumn?._codec !== undefined
        ) {
          return yield* Effect.die(
            new QueryInvariantError({
              cause:
                'Version column should be not nullable not PK integer without codec',
            }),
          );
        }

        nextVersion = updateOptions.expectedVersion + 1;
        currentRows = { ...currentRows, version: nextVersion };
      }

      const result = yield* updateQb
        .set(currentRows)
        .where((b) => {
          const p = b.eq(b.col(t._name, pk), b.lit(id));

          if (updateOptions.expectedVersion !== undefined) {
            return b.and(
              p,
              b.eq(
                b.col(t._name, 'version') as Expr<number>,
                b.lit(updateOptions.expectedVersion),
              ),
            );
          }
          return p;
        })
        .returning(...colNames)
        .execute();

      const head = Array.head(result);

      if (Option.isNone(head)) {
        if (updateOptions.expectedVersion !== undefined) {
          return yield* new OptimisticLockError({
            table: t._name,
            expectedVersion: updateOptions.expectedVersion,
            id,
          });
        }

        return yield* new NotFoundError({});
      }

      const map = yield* IdentityMapTag;
      yield* map.set(t._name, id, head.value);

      return head.value;
    });

  const findById = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver | IdentityMapTag> =>
    Effect.gen(function* () {
      const map = yield* IdentityMapTag;
      const cached = yield* map.get<InferRow<T>>(t._name, id);

      if (cached) {
        return cached;
      }

      const row = yield* selectQb
        .where((b) => b.eq(b.col(alias, pk), b.lit(id)))
        .selectAll()
        .executeOne()
        .pipe(Effect.map(Option.getOrNull));

      if (row) {
        yield* map.set(t._name, id, row);
      }

      return row;
    });

  const findBy = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver> =>
    selectQb
      .where((b) => criteriaToPred(criteria, b, alias))
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findMany = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<ReadonlyArray<InferRow<T>>, DriverError, Driver> =>
    selectQb
      .where((b) => criteriaToPred(criteria, b, alias))
      .selectAll()
      .execute();

  const save = (
    row: InferInsert<T>,
  ): Effect.Effect<InferRow<T>, DriverError, Driver | IdentityMapTag> =>
    Effect.gen(function* () {
      const result = yield* insertQb
        .values([row])
        .returning(...colNames)
        .execute();

      const head = Array.head(result);

      if (Option.isNone(head)) {
        return yield* Effect.die(
          new ReturningError({
            cause: 'Expected INSERT RETURNING to return one row',
          }),
        );
      }

      const rowId = head.value[pk];
      if (typeof rowId !== 'string' && typeof rowId !== 'number') {
        return yield* Effect.die(
          new PrimaryKeyError({
            cause: 'Expected PRIMARY KEY to be string or number',
          }),
        );
      }

      const map = yield* IdentityMapTag;
      yield* map.set<InferRow<T>>(t._name, rowId, head.value);

      return head.value;
    });

  return { findBy, findById, findMany, save, delete: del, update };
};
