import { Effect, HashMap, Option } from 'effect';

import type { Compiled } from '#compiler/compiler.js';
import type { IR } from '#compiler/ir.js';
import type { Dialect } from '#dialect.js';

import { compile } from '#compiler/compiler.js';

export const makeCompileCache = (dialect: Dialect) => {
  let map = HashMap.empty<IR, Effect.Effect<Compiled>>();

  return (ir: IR) =>
    Effect.gen(function* () {
      const item = HashMap.get(map, ir);
      if (Option.isSome(item)) {
        return yield* item.value;
      }

      const work = Effect.sync(() => compile(ir, dialect));
      const memo = yield* Effect.cached(work);

      map = HashMap.set(map, ir, memo);
      return yield* memo;
    });
};
