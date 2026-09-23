import { Context, Effect, Layer, Ref } from 'effect';
import { isDeepStrictEqual } from 'node:util';

import type { Driver } from '#drivers/driver.js';
import type {
  DriverError,
  EntityAlreadyTrackedError,
  NotFoundError,
  OptimisticLockError,
} from '#errors/errors.js';
import type { UpdateRowOptions } from '#repository/update.js';
import type { AnyTableDef } from '#schema/table.js';
import type { IdentityBaseKey, IdentityMap } from '#uow/identity-map.js';

import { QueryInvariantError } from '#errors/errors.js';
import { PrimaryKeyError } from '#errors/errors.js';
import { updateRow } from '#repository/update.js';
import { makeIdentityMap } from '#uow/identity-map.js';
import { withTransaction } from '#uow/transaction.js';
import { findPrimaryKey } from '#utils/find-primary-key.js';

type UoWEffect = Effect.Effect<
  unknown,
  DriverError | EntityAlreadyTrackedError | NotFoundError | OptimisticLockError,
  Driver
>;

interface UnitOfWorkApi {
  readonly commit: Effect.Effect<
    void,
    | DriverError
    | EntityAlreadyTrackedError
    | NotFoundError
    | OptimisticLockError,
    Driver
  >;
  readonly identity: IdentityMap;
  readonly pendingCount: Effect.Effect<number>;
  readonly rollback: Effect.Effect<void>;
  readonly isTracked: (
    table: AnyTableDef,
    id: IdentityBaseKey,
  ) => Effect.Effect<boolean>;
  readonly register: (effect: UoWEffect) => Effect.Effect<void>;
  readonly track: <T extends AnyTableDef, E extends TrackedEntity>(
    table: T,
    entity: E,
  ) => Effect.Effect<void>;
  readonly untrack: <T extends AnyTableDef>(
    table: T,
    pk: IdentityBaseKey,
  ) => Effect.Effect<void>;
}

export class UnitOfWork extends Context.Service<UnitOfWork, UnitOfWorkApi>()(
  'effect-orm/UnitOfWork',
) {}

type TrackedEntity = Record<string, unknown>;
type Snapshot = Readonly<Record<string, unknown>>;
interface TrackedEntry {
  readonly snapshot: Snapshot;
  readonly table: AnyTableDef;
}
interface TrackedUpdateResult {
  readonly entity: TrackedEntity;
  readonly savedRow: TrackedEntity;
}

const makeUnitOfWork = Effect.gen(function* () {
  const pendingEffectsRef = yield* Ref.make<ReadonlyArray<UoWEffect>>([]);
  const identity = yield* makeIdentityMap;
  const trackedRef = yield* Ref.make<Map<TrackedEntity, TrackedEntry>>(
    new Map(),
  );

  return UnitOfWork.of({
    identity,
    isTracked: (table, id) =>
      Ref.get(trackedRef).pipe(
        Effect.map((tracked) => {
          const primaryKey = findPrimaryKey(table);
          for (const entry of tracked.values()) {
            if (
              entry.table._name === table._name &&
              entry.snapshot[primaryKey] === id
            ) {
              return true;
            }
          }
          return false;
        }),
      ),
    register: (eff: UoWEffect) =>
      Ref.update(pendingEffectsRef, (effect) => [...effect, eff]),
    pendingCount: Ref.get(pendingEffectsRef).pipe(Effect.map((s) => s.length)),
    commit: Effect.gen(function* () {
      const pendingEffects = yield* Ref.get(pendingEffectsRef);
      const trackedMap = yield* Ref.get(trackedRef);
      const updateEffects: Array<
        Effect.Effect<
          TrackedUpdateResult,
          DriverError | NotFoundError | OptimisticLockError,
          Driver
        >
      > = [];
      const nextTrackedMap: Map<TrackedEntity, TrackedEntry> = new Map(
        trackedMap,
      );

      for (const [entity, value] of trackedMap) {
        const { table, snapshot } = value;

        const pk = findPrimaryKey(table);
        const pkValue = entity[pk];
        const isPkValueNumberOrString =
          typeof pkValue === 'number' || typeof pkValue === 'string';

        if (!isPkValueNumberOrString) {
          return yield* Effect.die(
            new PrimaryKeyError({
              cause: `Can't handle primary key value`,
            }),
          );
        }

        if (isDeepStrictEqual(entity, snapshot)) {
          continue;
        }

        const changes: TrackedEntity = {};

        for (const key in entity) {
          if (isDeepStrictEqual(entity[key], snapshot[key])) {
            continue;
          }
          changes[key] = entity[key];
        }

        const versionColumnName = table._options?.versionColumn;
        const options: UpdateRowOptions = {};

        if (versionColumnName !== undefined) {
          const expectedVersion = snapshot[versionColumnName];

          if (typeof expectedVersion !== 'number') {
            return yield* Effect.die(
              new QueryInvariantError({
                cause: 'Expected version in snapshot must be a number',
              }),
            );
          }

          options.expectedVersion = expectedVersion;
        }

        updateEffects.push(
          updateRow(table, pkValue, changes, options).pipe(
            Effect.map((savedRow) => ({ entity, savedRow })),
          ),
        );
      }

      if (updateEffects.length === 0 && pendingEffects.length === 0) {
        return;
      }

      const updateResults = yield* withTransaction(
        Effect.gen(function* () {
          yield* Effect.all(pendingEffects, {
            concurrency: 1,
            discard: true,
          });

          return yield* Effect.all(updateEffects, {
            concurrency: 1,
          });
        }),
      );

      for (const { entity, savedRow } of updateResults) {
        const entry = nextTrackedMap.get(entity);

        if (entry !== undefined) {
          Object.assign(entity, savedRow);

          nextTrackedMap.set(entity, {
            table: entry.table,
            snapshot: structuredClone(savedRow),
          });
        }
      }

      yield* Ref.set(pendingEffectsRef, []);
      yield* Ref.set(trackedRef, nextTrackedMap);
    }),
    rollback: Effect.gen(function* () {
      yield* Ref.set(pendingEffectsRef, []).pipe(
        Effect.andThen(identity.clear),
      );
      yield* Ref.set(trackedRef, new Map());
    }),
    track: (table, entity) =>
      Ref.update(trackedRef, (tracked) => {
        if (tracked.has(entity)) {
          return tracked;
        }

        return new Map(tracked).set(entity, {
          table,
          snapshot: structuredClone(entity),
        });
      }),
    untrack: (table, pk) =>
      Ref.update(trackedRef, (tracked) => {
        let next: Map<TrackedEntity, TrackedEntry> | undefined;

        for (const [key, entry] of tracked) {
          if (
            entry.table._name === table._name &&
            entry.snapshot[findPrimaryKey(entry.table)] === pk
          ) {
            next ??= new Map(tracked);
            next.delete(key);
          }
        }

        return next ?? tracked;
      }),
  });
});

export const UnitOfWorkLayer = Layer.effect(UnitOfWork, makeUnitOfWork);
