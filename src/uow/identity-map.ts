import { Context, Effect, Layer, Ref } from 'effect';

export type IdentityBaseKey = number | string;
type Key = `${string}:${IdentityBaseKey}`;
type IdentityState = Map<Key, unknown>;

export interface IdentityMap {
  readonly clear: Effect.Effect<void>;
  readonly get: <E>(
    table: string,
    id: IdentityBaseKey,
  ) => Effect.Effect<E | null>;
  readonly invalidate: (
    table: string,
    key: IdentityBaseKey,
  ) => Effect.Effect<void>;
  readonly set: <E>(
    table: string,
    id: IdentityBaseKey,
    entity: E,
  ) => Effect.Effect<void>;
}

export class IdentityMapTag extends Context.Service<
  IdentityMapTag,
  IdentityMap
>()('effect-orm/IdentityMapTag') {}

const makeIdentityStateKey = (table: string, id: IdentityBaseKey): Key =>
  `${table}:${id}`;

export const makeIdentityMap: Effect.Effect<IdentityMap> = Effect.gen(
  function* () {
    const ref = yield* Ref.make<IdentityState>(new Map());

    return {
      get: <E>(table: string, id: IdentityBaseKey) =>
        Ref.get(ref).pipe(
          Effect.map(
            (m) => (m.get(makeIdentityStateKey(table, id)) as E) ?? null,
          ),
        ),

      invalidate: (table: string, id: IdentityBaseKey) =>
        Ref.update(ref, (curr) => {
          const key = makeIdentityStateKey(table, id);

          if (!curr.has(key)) {
            return curr;
          }

          const next = new Map(curr);
          next.delete(key);
          return next;
        }),

      set: <E>(table: string, id: IdentityBaseKey, entity: E) =>
        Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(makeIdentityStateKey(table, id), entity);
          return next;
        }),

      clear: Ref.set(ref, new Map()),
    };
  },
);

export const IdentityMapLayer = Layer.effect(IdentityMapTag, makeIdentityMap);
