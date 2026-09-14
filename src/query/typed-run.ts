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
import type { AnyTableDef } from '#schema/table.js';
import { lit } from '#query/expressions.js';

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

type RunOptions<S extends Statement<unknown>, T extends AnyTableDef> = {
  readonly stmt: S;
  readonly codecFactories?:
    Readonly<Record<string, NonNullable<ColumnDef['_codec']>>> | undefined;
  readonly table?: T | undefined;
};

export const runWithSql = <
  S extends Statement<unknown>,
  T extends AnyTableDef,
>({
  stmt,
  table,
  codecFactories,
}: RunOptions<S, T>): Effect.Effect<RunResult<S>, DriverError, Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const writeCodec: Record<string, Codec<unknown, unknown>> = {};
    let preparedStm: Statement<unknown> = stmt;

    if (stmt._tag === 'Insert' && table !== undefined) {
      for (const [k, v] of Object.entries(table._columns)) {
        if (v._codec) {
          writeCodec[k] = v._codec(driver.dialect.id);
        }
      }

      const encodedRows: Array<InsertIR['rows'][number]> = [];

      for (const row of stmt.rows) {
        const encodedRow = { ...row };

        for (const [k, v] of Object.entries(row)) {
          if (v._tag === 'Literal' && v.value !== null) {
            const codec = writeCodec[k];
            if (codec) {
              encodedRow[k] = yield* Effect.try({
                try: () => lit(codec.encode(v.value)),
                catch: (cause) =>
                  new CodecError({ cause, value: v.value, column: k }),
              });
            }
          }
        }

        encodedRows.push(encodedRow);
      }
    }

    const { sql, params } = compile(preparedStm, driver.dialect);

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

export const run = <S extends Statement<unknown>, T extends AnyTableDef>({
  stmt,
  table,
  codecFactories,
}: RunOptions<S, T>): Effect.Effect<StatementResult<S>, DriverError, Driver> =>
  runWithSql({ stmt, table, codecFactories }).pipe(Effect.map((r) => r.result));
