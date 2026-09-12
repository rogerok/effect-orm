import { Effect } from 'effect';

import type { Codec } from '#codec.js';
import type { DeleteIR, InsertIR, UpdateIR } from '#compiler/ir.js';
import type { DriverError } from '#errors/errors.js';
import type {
  Delete,
  Insert,
  Select,
  Statement,
  Update,
} from '#query/typed-ast.js';
import type { ColumnDef } from '#schema/columns.js';

import { compile } from '#compiler/compiler.js';
import { Driver } from '#drivers/driver.js';
import { CodecError } from '#errors/errors.js';

export type AffectedRows = { readonly affectedRows: number };

export type StatementResult<S> =
  S extends Select<infer R>
    ? ReadonlyArray<R>
    : S extends Insert<infer R>
      ? R
      : S extends Update<infer R>
        ? R
        : S extends Delete<infer R>
          ? R
          : never;

interface RunResult<S> {
  readonly result: StatementResult<S>;
  readonly sql: string;
}

export const runWithSql = <S extends Statement<unknown>>(
  stmt: S,
  codecFactories?: Readonly<Record<string, NonNullable<ColumnDef['_codec']>>>,
): Effect.Effect<RunResult<S>, DriverError, Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const { sql, params } = compile(stmt, driver.dialect);

    const raw = yield* driver.executeRaw(sql, params);

    let rows = raw.rows;
    if (codecFactories) {
      const codecs: Record<string, Codec<unknown, unknown>> = {};

      for (const [k, v] of Object.entries(codecFactories)) {
        codecs[k] = v(driver.dialect.id);
      }

      const codecEntries = Object.entries(codecs);

      if (codecEntries.length > 0) {
        const decodedRows: Record<string, unknown>[] = [];

        for (const r of raw.rows) {
          const row = { ...r };

          for (const [col, codec] of codecEntries) {
            const value = r[col];

            if (value === null) {
              continue;
            }

            row[col] = yield* Effect.try({
              try: () => codec.decode(value),
              catch: (cause) => new CodecError({ column: col, cause, value }),
            });
          }

          decodedRows.push(row);
        }

        rows = decodedRows;
      }
    }

    const hasReturning =
      stmt._tag === 'Select' ||
      (stmt as DeleteIR | InsertIR | UpdateIR).returning !== null;

    const result = (
      hasReturning ? rows : { affectedRows: raw.affectedRows }
    ) as StatementResult<S>;

    return { result, sql };
  });

export const run = <S extends Statement<unknown>>(
  stmt: S,
  codecFactories?: Readonly<Record<string, NonNullable<ColumnDef['_codec']>>>,
): Effect.Effect<StatementResult<S>, DriverError, Driver> =>
  runWithSql(stmt, codecFactories).pipe(Effect.map((r) => r.result));
