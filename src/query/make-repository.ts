import { Array, Effect, Option } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { InferInsert, InferRow, InferUpdate } from '#schema/infer.js';

import {
  NotFoundError,
  PrimaryKeyError,
  ReturningError,
} from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import {
  deleteFrom,
  insertInto,
  update as updateBuilder,
} from '#query/write-builders.js';
import { type AnyTableDef } from '#schema/table.js';

type PrimaryKeyName<T extends AnyTableDef> = {
  [K in keyof T['_columns'] & string]: T['_columns'][K]['_pk'] extends true
    ? K
    : never;
}[keyof T['_columns'] & string];

export const makeRepository = <T extends AnyTableDef>(t: T) => {
  const alias = t._name[0] ?? 'r';
  const entries = Object.entries(t._columns);
  const pk = entries[entries.findIndex(([__, v]) => v._pk)]?.[0];
  const colNames = Object.keys(t._columns) as ReadonlyArray<
    keyof InferRow<T> & string
  >;

  if (pk === undefined) {
    throw new PrimaryKeyError({
      cause: 'Primary key should exist in the table',
    });
  }

  const selectQb = selectFrom(t, alias);
  const insertQb = insertInto(t);
  const deleteQb = deleteFrom(t);
  const updateQb = updateBuilder(t);

  const del = (
    id: InferRow<T>[PrimaryKeyName<T>],
  ): Effect.Effect<void, DriverError, Driver> =>
    deleteQb
      .where((b) => b.eq(b.col(t._name, pk), b.lit(id)))
      .execute()
      .pipe(Effect.asVoid);

  const update = (
    id: InferRow<T>[PrimaryKeyName<T>],
    rows: InferUpdate<T>,
  ): Effect.Effect<InferRow<T>, DriverError | NotFoundError, Driver> =>
    Effect.gen(function* () {
      const q = updateQb
        .set(rows)
        .where((b) => b.eq(b.col(t._name, pk), b.lit(id)))
        .returning(...colNames);

      const result = yield* q.execute();

      const head = Array.head(result);

      if (Option.isNone(head)) {
        return yield* new NotFoundError({});
      }

      return head.value;
    });

  const findById = (
    id: InferRow<T>[PrimaryKeyName<T>],
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver> =>
    selectQb
      .where((b) => b.eq(b.col(alias, pk), b.lit(id)))
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findBy = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver> =>
    selectQb
      .where((b) =>
        b.and(
          ...Object.entries(criteria).map(([k, v]) =>
            v === null
              ? b.isNull(b.col(alias, k))
              : b.eq(b.col(alias, k), b.lit(v)),
          ),
        ),
      )
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findMany = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<ReadonlyArray<InferRow<T>>, DriverError, Driver> =>
    selectQb
      .where((b) =>
        b.and(
          ...Object.entries(criteria).map(([k, v]) =>
            v === null
              ? b.isNull(b.col(alias, k))
              : b.eq(b.col(alias, k), b.lit(v)),
          ),
        ),
      )
      .selectAll()
      .execute();

  const save = (
    row: InferInsert<T>,
  ): Effect.Effect<InferRow<T>, DriverError, Driver> =>
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

      return head.value;
    });

  return { findBy, findById, findMany, save, delete: del, update };
};
