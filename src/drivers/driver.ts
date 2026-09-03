import type { Effect, Stream } from 'effect';

import { Context } from 'effect';

import type { Dialect } from '#dialect.js';
import type { DriverError } from '#errors/errors.js';

export interface RawResult {
  readonly affectedRows: number;
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly lastInsertRowId?: bigint | number;
}

export interface DriverImpl {
  readonly dialect: Dialect;
  readonly executeRaw: (
    sql: string,
    params: ReadonlyArray<unknown>,
  ) => Effect.Effect<RawResult, DriverError>;

  readonly executeStream: (
    sql: string,
    params: ReadonlyArray<unknown>,
    chunkSize?: number,
  ) => Stream.Stream<Record<string, unknown>, DriverError>;
}

export class Driver extends Context.Service<Driver, DriverImpl>()(
  'effect-orm/Driver',
) {}
