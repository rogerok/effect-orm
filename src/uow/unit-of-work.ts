import { Context, Effect, Layer, Ref } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError, NotFoundError } from '#errors/errors.js';
import type { IdentityMap } from '#uow/identity-map.js';

import { makeIdentityMap } from '#uow/identity-map.js';
import { withTransaction } from '#uow/transaction.js';

type UoWEffect = Effect.Effect<unknown, DriverError | NotFoundError, Driver>;

interface UnitOfWorkApi {
  readonly commit: Effect.Effect<void, DriverError | NotFoundError, Driver>;
  readonly identity: IdentityMap;
  readonly pendingCount: Effect.Effect<number>;
  readonly rollback: Effect.Effect<void>;
  readonly register: (effect: UoWEffect) => Effect.Effect<void>;
}

export class UnitOfWork extends Context.Service<UnitOfWork, UnitOfWorkApi>()(
  'effect-orm/UnitOfWork',
) {}

const makeUnitOfWork = Effect.gen(function* () {
  const stateRef = yield* Ref.make<ReadonlyArray<UoWEffect>>([]);
  const identity = yield* makeIdentityMap;

  return UnitOfWork.of({
    identity,
    register: (eff: UoWEffect) =>
      Ref.update(stateRef, (effect) => [...effect, eff]),
    pendingCount: Ref.get(stateRef).pipe(Effect.map((s) => s.length)),
    commit: Effect.gen(function* () {
      const effects = yield* Ref.get(stateRef);
      if (effects.length === 0) {
        return;
      }

      yield* withTransaction(
        Effect.all(effects, { concurrency: 1, discard: true }),
      );

      yield* Ref.set(stateRef, []);
    }),

    rollback: Ref.set(stateRef, []).pipe(Effect.andThen(identity.clear)),
  });
});

export const UnitOfWorkLayer = Layer.effect(UnitOfWork, makeUnitOfWork);
