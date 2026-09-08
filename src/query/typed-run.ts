import { Effect } from 'effect';

import type { DeleteIR, InsertIR, UpdateIR } from '#compiler/ir.js';
import type { DriverError } from '#errors/errors.js';
import type {
  Delete,
  Insert,
  Select,
  Statement,
  Update,
} from '#query/typed-ast.js';

import { compile } from '#compiler/compiler.js';
import { Driver } from '#drivers/driver.js';

type AffectedRows = { readonly affectedRows: number };

type StatementResult<S> =
  S extends Select<infer R>
    ? ReadonlyArray<R>
    : S extends Insert<infer R>
      ? R extends AffectedRows
        ? R
        : ReadonlyArray<R>
      : S extends Update<infer R>
        ? R extends AffectedRows
          ? R
          : ReadonlyArray<R>
        : S extends Delete<infer R>
          ? R extends AffectedRows
            ? R
            : ReadonlyArray<R>
          : never;

interface RunResult<S> {
  readonly result: StatementResult<S>;
  readonly sql: string;
}

export const runWithSql = <S extends Statement<unknown>>(
  stmt: S,
): Effect.Effect<RunResult<S>, DriverError, Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const { sql, params } = compile(stmt, driver.dialect);

    const raw = yield* driver.executeRaw(sql, params);

    const hasReturning =
      stmt._tag === 'Select' ||
      (stmt as DeleteIR | InsertIR | UpdateIR).returning !== null;

    const result = (
      hasReturning ? raw.rows : { affectedRows: raw.affectedRows }
    ) as StatementResult<S>;

    return { result, sql };
  });

export const run = <S extends Statement<unknown>>(
  stmt: S,
): Effect.Effect<StatementResult<S>, DriverError, Driver> =>
  runWithSql(stmt).pipe(Effect.map((r) => r.result));
