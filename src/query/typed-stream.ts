import { Effect, Stream } from 'effect';

import type { DriverError } from '#errors/errors.js';
import type { Select } from '#query/typed-ast.js';

import { compile } from '#compiler/compiler.js';
import { Driver } from '#drivers/driver.js';

export const streamFromSelect = <R>(
  statement: Select<R>,
  chunkSize?: number,
): Stream.Stream<R, DriverError, Driver> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const driver = yield* Driver;
      const { sql, params } = compile(statement, driver.dialect);

      return driver
        .executeStream(sql, params, chunkSize)
        .pipe(Stream.map((el) => el as unknown as R));
    }),
  );
