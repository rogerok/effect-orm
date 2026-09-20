import { Effect, Layer, Match, Ref } from 'effect';
import { Context } from 'effect';

import type { Expr } from '#compiler/ir.js';
import type { Driver } from '#drivers/driver.js';
import type { DriverError, NotFoundError } from '#errors/errors.js';
import type { InferRow } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';
import type { IdentityMap, IdentityMapTag } from '#uow/identity-map.js';

import { col, eq, lit } from '#compiler/ir-constructors.js';
import { runIr } from '#compiler/run-ir.js';
import { makeIdentityMap } from '#uow/identity-map.js';
import { withTransaction } from '#uow/transaction.js';

type Pending =
  | {
      readonly _tag: 'Delete';
      readonly id: number | string;
      readonly table: string;
    }
  | {
      readonly _tag: 'Insert';
      readonly row: Readonly<Record<string, unknown>>;
      readonly table: string;
    }
  | {
      readonly _tag: 'Update';
      readonly id: number | string;
      readonly patch: Readonly<Record<string, unknown>>;
      readonly table: string;
    };

type UoWItem = Effect.Effect<unknown, DriverError | NotFoundError, Driver>;

interface UoWState {
  readonly pending: ReadonlyArray<Pending>;
}

interface UnitOfWorkApi {
  readonly identity: IdentityMap;
  readonly commit: () => Effect.Effect<void, DriverError, Driver>;
  readonly pendingCount: () => Effect.Effect<number>;
  readonly registerDelete: (
    table: string,
    id: number | string,
  ) => Effect.Effect<void>;
  readonly registerInsert: (
    table: string,
    row: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  readonly registerUpdate: (
    table: string,
    id: number | string,
    patch: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  readonly rollback: () => Effect.Effect<void>;
}

export class UnitOfWork extends Context.Service<UnitOfWork, UnitOfWorkApi>()(
  'effect-orm/UnitOfWork',
) {}

const literalRow = (row: Record<string, unknown>): Record<string, Expr> =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, lit(v)]));

const applyPending = (pending: Pending) =>
  Match.value(pending).pipe(
    Match.tag('Insert', (p) =>
      runIr({
        _tag: 'Insert',
        into: p.table,
        rows: [literalRow(p.row)],
        returning: null,
      }),
    ),
    Match.tag('Update', (p) =>
      runIr({
        _tag: 'Update',
        table: p.table,
        set: literalRow(p.patch),
        returning: null,
        where: eq(col('id'), lit(p.id)),
      }),
    ),
    Match.tag('Delete', (p) =>
      runIr({
        _tag: 'Delete',
        from: p.table,
        returning: null,
        where: eq(col('id'), lit(p.id)),
      }),
    ),
    Match.exhaustive,
  );

const makeUnitOfWork = Effect.gen(function* () {
  const stateRef = yield* Ref.make<ReadonlyArray<Pending>>([]);
  const identity = yield* makeIdentityMap;

  const append = (p: Pending) =>
    Ref.update(stateRef, (pending) => [...pending, p]);

  return UnitOfWork.of({
    identity,
    registerInsert: (table, row) => append({ _tag: 'Insert', table, row }),
    registerUpdate: (table, id, patch) =>
      append({ _tag: 'Update', table, id, patch }),
    registerDelete: (table, id) => append({ _tag: 'Delete', table, id }),
    pendingCount: () => Ref.get(stateRef).pipe(Effect.map((s) => s.length)),
    commit: () =>
      Effect.gen(function* () {
        const pending = yield* Ref.get(stateRef);
        if (pending.length === 0) {
          return;
        }

        yield* withTransaction(
          Effect.forEach(pending, applyPending, { discard: true }),
        );

        yield* Ref.set(stateRef, []);
      }),

    rollback: () => Ref.set(stateRef, []).pipe(Effect.andThen(identity.clear)),
  });
});

export const UnitOfWorkLayer = Layer.effect(UnitOfWork, makeUnitOfWork);
