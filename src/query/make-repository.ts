import { Effect, Option } from 'effect';

import type { InferRow } from '#schema/infer.js';

import { PrimaryKeyError } from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
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

  if (pk === undefined) {
    throw new PrimaryKeyError({
      cause: 'Primary key should exist in the table',
    });
  }

  const selectQb = selectFrom(t, alias);

  const findById = (id: InferRow<T>[PrimaryKeyName<T>]) =>
    selectQb
      .where((b) => b.eq(b.col(alias, pk), b.lit(id)))
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findBy = (criteria: Partial<InferRow<T>>) =>
    selectQb
      .where((b) =>
        b.and(
          ...Object.entries(criteria).map(([k, v]) =>
            b.eq(b.col(alias, k), b.lit(v)),
          ),
        ),
      )
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findMany = (criteria: Partial<InferRow<T>>) =>
    selectQb
      .where((b) =>
        b.and(
          ...Object.entries(criteria).map(([k, v]) =>
            b.eq(b.col(alias, k), b.lit(v)),
          ),
        ),
      )
      .selectAll()
      .execute();

  return { findBy, findById, findMany };
};
