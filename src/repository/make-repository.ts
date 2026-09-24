import { Array, Effect, Option } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type {
  DriverError,
  NotFoundError,
  OptimisticLockError,
} from '#errors/errors.js';
import type { ExpressionBuilder, Source } from '#query/expression-builder.js';
import type { Pred } from '#query/typed-ast.js';
import type { PrimaryKeyName } from '#schema/columns.js';
import type { InferInsert, InferRow, InferUpdate } from '#schema/infer.js';
import type { Relations, TableRelations } from '#schema/relations.js';
import type { IdentityBaseKey } from '#uow/identity-map.js';

import {
  EntityAlreadyTrackedError,
  PrimaryKeyError,
  QueryInvariantError,
  ReturningError,
} from '#errors/errors.js';
import { selectFrom } from '#query/builder.js';
import { now } from '#query/expressions.js';
import { deleteFrom, insertInto } from '#query/write-builders.js';
import { updateRow } from '#repository/update.js';
import { type AnyTableDef } from '#schema/table.js';
import { withTransaction } from '#uow/transaction.js';
import { UnitOfWork } from '#uow/unit-of-work.js';
import { findPrimaryKey } from '#utils/find-primary-key.js';

interface MakeRepositoryOptions<
  T extends AnyTableDef,
  R extends Record<string, Relations<T, AnyTableDef>> = Record<
    string,
    Relations<T, AnyTableDef>
  >,
> {
  readonly alias?: string;
  readonly relations?: TableRelations<T, R>;
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

export const makeRepository = <
  T extends AnyTableDef,
  R extends Record<string, Relations<T, AnyTableDef>> = Record<
    string,
    Relations<T, AnyTableDef>
  >,
>(
  t: T,
  options?: MakeRepositoryOptions<T, R>,
) => {
  const alias = options?.alias ?? t._name;
  const pk = findPrimaryKey(t);
  const colNames = Object.keys(t._columns) as ReadonlyArray<
    keyof InferRow<T> & string
  >;

  const softDeleteCol = t._options?.deletedAtColumn;

  if (softDeleteCol !== undefined) {
    const column = t._columns[softDeleteCol];

    if (
      !Object.hasOwn(t._columns, softDeleteCol) ||
      column?._type !== 'timestamp' ||
      column._pk ||
      !column._nullable
    ) {
      throw new QueryInvariantError({
        cause:
          'Soft-delete column must be an existing nullable non-PK timestamp',
      });
    }
  }

  if (softDeleteCol === undefined && options?.relations) {
    for (const relation of Object.values(options.relations.relations)) {
      if (relation.table._options?.deletedAtColumn !== undefined) {
        throw new QueryInvariantError({
          cause: `Cannot hard-delete ${t._name}: related table ${relation.table._name} uses soft delete`,
        });
      }
    }
  }

  const selectQb = selectFrom(t, alias);
  const insertQb = insertInto(t);
  const deleteQb = deleteFrom(t);

  const hardDelete = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
  ): Effect.Effect<void, DriverError, Driver | UnitOfWork> =>
    Effect.gen(function* () {
      const uow = yield* UnitOfWork;
      const map = uow.identity;
      const deleteEff = deleteQb
        .where((b) => b.eq(b.col(t._name, pk), b.lit(id)))
        .execute();

      const deletedRelations = yield* withTransaction(
        Effect.gen(function* () {
          let deletedRows: ReadonlyArray<{
            readonly keys: ReadonlyArray<IdentityBaseKey>;
            readonly table: AnyTableDef;
          }> = [];
          if (options?.relations) {
            const { relations } = options.relations;

            const row = yield* selectQb
              .where((b) => b.eq(b.col(alias, pk), b.lit(id)))
              .selectAll()
              .executeOne();

            if (Option.isSome(row)) {
              const effects = Object.values(relations)
                .filter((rel) => rel.onDelete === 'cascade')
                .map((relation) =>
                  deleteFrom(relation.table)
                    .where((b) =>
                      b.eq(
                        b.col(relation.table._name, relation.columns[pk]),
                        b.lit(row.value[pk]),
                      ),
                    )
                    .returning(findPrimaryKey(relation.table))
                    .execute()
                    .pipe(
                      Effect.map((result) => ({
                        keys: result
                          .map((r) => r[findPrimaryKey(relation.table)])
                          .filter(
                            (key) =>
                              typeof key === 'string' ||
                              typeof key === 'number',
                          ),
                        table: relation.table,
                      })),
                    ),
                );

              deletedRows = yield* Effect.all(effects, {
                concurrency: 1,
              });
            }
          }
          yield* deleteEff;
          return deletedRows;
        }),
      );

      yield* map.invalidate(t._name, id);
      yield* Effect.forEach(
        deletedRelations,
        ({ keys, table }) =>
          Effect.forEach(
            keys,
            (key) =>
              Effect.gen(function* () {
                yield* map.invalidate(table._name, key);
                yield* uow.untrack(table, key);
              }),
            { discard: true, concurrency: 1 },
          ),
        {
          discard: true,
          concurrency: 1,
        },
      );
    });

  /**
   * Tracked rows must be changed through their live objects and `commit`.
   * Explicit updates remain rejected after `commit`; `rollback` clears tracking.
   */
  const update = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
    rows: InferUpdate<T>,
    updateOptions: RepoUpdateOptions = {},
  ): Effect.Effect<
    InferRow<T>,
    | DriverError
    | EntityAlreadyTrackedError
    | NotFoundError
    | OptimisticLockError,
    Driver | UnitOfWork
  > =>
    Effect.gen(function* () {
      const uow = yield* UnitOfWork;
      if (yield* uow.isTracked(t, id)) {
        return yield* new EntityAlreadyTrackedError({ table: t._name, id });
      }

      const result = yield* updateRow(t, id, rows, updateOptions);
      yield* uow.identity.set(t._name, id, result);

      return result;
    });

  const del = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
    updateOptions: RepoUpdateOptions = {},
  ): Effect.Effect<
    void,
    | DriverError
    | EntityAlreadyTrackedError
    | NotFoundError
    | OptimisticLockError,
    Driver | UnitOfWork
  > =>
    Effect.gen(function* () {
      if (softDeleteCol) {
        yield* update(
          id,
          {
            [softDeleteCol]: now(),
            // TODO:избавиться от type assertion
          } as InferUpdate<T>,
          updateOptions,
        );

        const uow = yield* UnitOfWork;
        yield* uow.identity.invalidate(t._name, id);
      } else {
        const uow = yield* UnitOfWork;
        if (yield* uow.isTracked(t, id)) {
          return yield* new EntityAlreadyTrackedError({ table: t._name, id });
        }

        yield* hardDelete(id);
      }
    });

  const findById = (
    id: Extract<InferRow<T>[PrimaryKeyName<T>], IdentityBaseKey>,
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver | UnitOfWork> =>
    Effect.gen(function* () {
      const uow = yield* UnitOfWork;
      const cached = yield* uow.identity.get<InferRow<T>>(t._name, id);

      if (cached) {
        if (softDeleteCol !== undefined && cached[softDeleteCol] !== null) {
          return null;
        }

        yield* uow.track(t, cached);
        return cached;
      }

      const row = yield* selectQb
        .where((b) => {
          const primaryKeyPredicate = b.eq(b.col(alias, pk), b.lit(id));

          if (softDeleteCol !== undefined) {
            return b.and(
              b.isNull(b.col(alias, softDeleteCol)),
              primaryKeyPredicate,
            );
          }

          return primaryKeyPredicate;
        })
        .selectAll()
        .executeOne()
        .pipe(Effect.map(Option.getOrNull));

      if (row) {
        yield* uow.identity.set(t._name, id, row);
        yield* uow.track(t, row);
      }

      return row;
    });

  const findBy = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<InferRow<T> | null, DriverError, Driver> =>
    selectQb
      .where((b) => {
        const criteriaPredicate = criteriaToPred(criteria, b, alias);

        if (softDeleteCol !== undefined) {
          return b.and(
            b.isNull(b.col(alias, softDeleteCol)),
            criteriaPredicate,
          );
        }

        return criteriaPredicate;
      })
      .selectAll()
      .executeOne()
      .pipe(Effect.map(Option.getOrNull));

  const findIncludingDeleted = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<ReadonlyArray<InferRow<T>>, DriverError, Driver> => {
    return selectQb
      .where((b) => criteriaToPred(criteria, b, alias))
      .selectAll()
      .execute();
  };

  const findMany = (
    criteria: Partial<InferRow<T>>,
  ): Effect.Effect<ReadonlyArray<InferRow<T>>, DriverError, Driver> => {
    if (softDeleteCol) {
      return selectQb
        .where((b) =>
          b.and(
            b.isNull(b.col(alias, softDeleteCol)),
            criteriaToPred(criteria, b, alias),
          ),
        )
        .selectAll()
        .execute();
    }

    return findIncludingDeleted(criteria);
  };

  const save = (
    row: InferInsert<T>,
  ): Effect.Effect<InferRow<T>, DriverError, Driver | UnitOfWork> =>
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

      const uow = yield* UnitOfWork;
      const map = uow.identity;
      yield* map.set<InferRow<T>>(t._name, rowId, head.value);

      return head.value;
    });

  return {
    findBy,
    findById,
    findMany,
    save,
    delete: del,
    update,
    findIncludingDeleted,
  };
};
