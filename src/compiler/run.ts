import { Effect } from 'effect';

import type { IR } from '#compiler/ir.js';
import type { RawResult } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';

import { compile } from '#compiler/compiler.js';
import { Driver } from '#drivers/driver.js';

export const run = (ir: IR): Effect.Effect<RawResult, DriverError, Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const { sql, params } = compile(ir, driver.dialect);

    return yield* driver.executeRaw(sql, params);
  });
