import { Effect } from 'effect';

import type { AnyCodec } from '#codec.js';
import type {
  DeleteIR,
  Expr,
  InsertIR,
  Predicate,
  UpdateIR,
} from '#compiler/ir.js';
import type { DriverError } from '#errors/errors.js';
import type {
  Delete,
  Insert,
  Select,
  Statement,
  Update,
} from '#query/typed-ast.js';
import type { ColumnDef } from '#schema/columns.js';
import type { AnyTableDef } from '#schema/table.js';

import { compile } from '#compiler/compiler.js';
import { Driver } from '#drivers/driver.js';
import { CodecError } from '#errors/errors.js';
import { lit } from '#query/expressions.js';
import { and, between, not, or } from '#query/predicates.js';

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
  readonly sources?: Readonly<Record<string, AnyTableDef>>;
  readonly table?: T | undefined;
};

export const runWithSql = <
  S extends Statement<unknown>,
  T extends AnyTableDef,
>({
  stmt,
  table,
  codecFactories,
  sources,
}: RunOptions<S, T>): Effect.Effect<RunResult<S>, DriverError, Driver> =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    let preparedStm: Statement<unknown> = stmt;

    const getCodec = (expr: Expr): AnyCodec | undefined => {
      if (sources && expr._tag === 'Column' && expr.table) {
        return sources[expr.table]?._columns[expr.name]?._codec?.(
          driver.dialect.id,
        );
      }

      return undefined;
    };

    const encodeLiteral = (col: Expr, litExpr: Expr) => {
      if (litExpr._tag === 'Literal' && col._tag === 'Column') {
        if (litExpr.value === null) return Effect.succeed(litExpr);
        const codec = getCodec(col);

        if (codec) {
          const encoder = codec.encode as (v: unknown) => unknown;
          return Effect.try({
            try: () => lit(encoder(litExpr.value)),
            catch: (cause) =>
              new CodecError({
                column: col?.name,
                value: litExpr.value,
                cause,
              }),
          });
        }
      }

      return Effect.succeed(litExpr);
    };

    const encodePredicate = (
      pred: Predicate,
    ): Effect.Effect<Predicate, CodecError> =>
      Effect.gen(function* () {
        if (pred._tag === 'And' || pred._tag === 'Or') {
          const preds = yield* Effect.forEach(pred.preds, encodePredicate);
          return pred._tag === 'And' ? and(...preds) : or(...preds);
        }

        if (pred._tag === 'Not') {
          const p = yield* encodePredicate(pred.pred);
          return not(p);
        }

        if (
          pred._tag === 'Gte' ||
          pred._tag === 'Gt' ||
          pred._tag === 'Lte' ||
          pred._tag === 'Lt' ||
          pred._tag === 'Neq' ||
          pred._tag === 'Eq'
        ) {
          const left = yield* encodeLiteral(pred.right, pred.left);
          const right = yield* encodeLiteral(pred.left, pred.right);

          return { ...pred, left, right };
        }

        if (pred._tag === 'In') {
          const values = yield* Effect.forEach(pred.values, (expr) =>
            encodeLiteral(pred.left, expr),
          );

          return { ...pred, values };
        }

        if (pred._tag === 'Between' && pred.expr._tag === 'Column') {
          const min = yield* encodeLiteral(pred.expr, pred.min);
          const max = yield* encodeLiteral(pred.expr, pred.max);

          return between(pred.expr, min, max);
        }

        return pred;
      });

    if (stmt._tag === 'Select') {
      if (stmt.where !== undefined) {
        const newPred = yield* encodePredicate(stmt.where);
        preparedStm = {
          ...stmt,
          where: newPred,
        };
      }
    }

    if (stmt._tag === 'Insert' && table !== undefined) {
      const writeCodec: Record<string, AnyCodec> = {};

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
              const encoder = codec.encode as (v: unknown) => unknown;

              encodedRow[k] = yield* Effect.try({
                try: () => lit(encoder(v.value)),
                catch: (cause) =>
                  new CodecError({ cause, value: v.value, column: k }),
              });
            }
          }
        }

        encodedRows.push(encodedRow);
      }

      preparedStm = { ...stmt, rows: encodedRows };
    }

    const { sql, params } = compile(preparedStm, driver.dialect);

    const raw = yield* driver.executeRaw(sql, params);

    let rows = raw.rows;
    if (codecFactories) {
      const codecs: Record<string, AnyCodec> = {};

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

            const decoder = codec.decode as (v: unknown) => unknown;

            row[col] = yield* Effect.try({
              try: () => decoder(value),
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

export const run = <S extends Statement<unknown>, T extends AnyTableDef>(
  options: RunOptions<S, T>,
): Effect.Effect<StatementResult<S>, DriverError, Driver> =>
  runWithSql(options).pipe(Effect.map((r) => r.result));
