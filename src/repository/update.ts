import { Array, Effect, Option } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { Expr } from '#query/typed-ast.js';
import type { PrimaryKeyName } from '#schema/columns.js';
import type { InferRow, InferUpdate } from '#schema/infer.js';
import type { IdentityBaseKey } from '#uow/identity-map.js';

import {
  NotFoundError,
  OptimisticLockError,
  QueryInvariantError,
} from '#errors/errors.js';
import { update as updateBuilder } from '#query/write-builders.js';
import { type AnyTableDef } from '#schema/table.js';
import { findPrimaryKey } from '#utils/find-primary-key.js';

export interface UpdateRowOptions {
  expectedVersion?: number | undefined;
}

export const updateRow = <T extends AnyTableDef>(
  table: T,
  id: IdentityBaseKey & InferRow<T>[PrimaryKeyName<T>],
  changes: InferUpdate<T>,
  updateOptions: UpdateRowOptions = {},
): Effect.Effect<
  InferRow<T>,
  DriverError | NotFoundError | OptimisticLockError,
  Driver
> =>
  Effect.gen(function* () {
    const pk = findPrimaryKey(table);

    const updateQb = updateBuilder(table);

    let updateValues = changes;
    const expectedVersion = updateOptions.expectedVersion;

    const versionColumnName = table._options?.versionColumn;

    if (expectedVersion !== undefined) {
      if (versionColumnName === undefined) {
        return yield* Effect.die(
          new QueryInvariantError({
            cause: 'Version column name should be defined',
          }),
        );
      }

      const versionColumn = table._columns[versionColumnName];

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

      updateValues = {
        ...updateValues,
        [versionColumnName]: expectedVersion + 1,
      };
    }

    const colNames = Object.keys(table._columns) as ReadonlyArray<
      keyof InferRow<T> & string
    >;

    const result = yield* updateQb
      .set(updateValues)
      .where((b) => {
        const primaryKeyPredicate = b.eq(b.col(table._name, pk), b.lit(id));

        if (expectedVersion !== undefined && versionColumnName !== undefined) {
          return b.and(
            primaryKeyPredicate,
            b.eq(
              b.col(table._name, versionColumnName) as Expr<number>,
              b.lit(expectedVersion),
            ),
          );
        }
        return primaryKeyPredicate;
      })
      .returning(...colNames)
      .execute();

    const updatedRow = Array.head(result);

    if (Option.isNone(updatedRow)) {
      if (expectedVersion !== undefined) {
        return yield* new OptimisticLockError({
          table: table._name,
          expectedVersion,
          id,
        });
      }

      return yield* new NotFoundError({});
    }

    return updatedRow.value;
  });
