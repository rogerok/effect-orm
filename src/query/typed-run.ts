import { Effect } from 'effect';

import type { AnyCodec } from '#codec.js';
import type {
  DeleteIR,
  Expr,
  InsertIR,
  Predicate,
  UpdateIR,
} from '#compiler/ir.js';
import type { DialectId } from '#dialect.js';
import type { DriverError } from '#errors/errors.js';
import type {
  Delete,
  Insert,
  Select,
  Statement,
  Update,
} from '#query/typed-ast.js';
import type { ColumnDef, SqlType } from '#schema/columns.js';
import type { AnyTableDef } from '#schema/table.js';

import { compile } from '#compiler/compiler.js';
import { optimizeSelect } from '#compiler/optimize.js';
import { Driver } from '#drivers/driver.js';
import { CodecError } from '#errors/errors.js';
import * as Q from '#query/index.js';

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

const getCodec = (
  expr: Expr,
  sources: Readonly<Record<string, AnyTableDef>>,
  dialectId: DialectId,
) => {
  if (sources && expr._tag === 'Column' && expr.table) {
    return sources[expr.table]?._columns[expr.name]?._codec?.(dialectId);
  }

  return undefined;
};

const encodeLiteral = (
  col: Expr,
  litExpr: Expr,
  sources: Readonly<Record<string, AnyTableDef>> | undefined,
  dialectId: DialectId,
) =>
  Effect.gen(function* () {
    if (
      litExpr._tag === 'Literal' &&
      col._tag === 'Column' &&
      sources !== undefined
    ) {
      if (litExpr.value === null) return litExpr;
      const codec = getCodec(col, sources, dialectId);

      if (codec) {
        const encoder = codec.encode as (v: unknown) => unknown;
        return yield* Effect.try({
          try: () => Q.lit(encoder(litExpr.value)),
          catch: (cause) =>
            new CodecError({
              column: col?.name,
              value: litExpr.value,
              cause,
            }),
        });
      }
    }

    return litExpr;
  });

const prepareCodecs = <
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
>(
  cols: Cols,
  dialectId: DialectId,
) => {
  const writeCodec: Record<string, AnyCodec> = {};

  for (const [k, v] of Object.entries(cols)) {
    if (v._codec) {
      writeCodec[k] = v._codec(dialectId);
    }
  }

  return writeCodec;
};

const encodePredicate = (
  pred: Predicate,
  sources: Readonly<Record<string, AnyTableDef>> | undefined,
  dialectId: DialectId,
): Effect.Effect<Predicate, CodecError> =>
  Effect.gen(function* () {
    if (pred._tag === 'And' || pred._tag === 'Or') {
      const preds = yield* Effect.forEach(pred.preds, (p) =>
        encodePredicate(p, sources, dialectId),
      );
      return pred._tag === 'And' ? Q.and(...preds) : Q.or(...preds);
    }

    if (pred._tag === 'Not') {
      const p = yield* encodePredicate(pred.pred, sources, dialectId);
      return Q.not(p);
    }

    if (
      pred._tag === 'Gte' ||
      pred._tag === 'Gt' ||
      pred._tag === 'Lte' ||
      pred._tag === 'Lt' ||
      pred._tag === 'Neq' ||
      pred._tag === 'Eq'
    ) {
      const left = yield* encodeLiteral(
        pred.right,
        pred.left,
        sources,
        dialectId,
      );
      const right = yield* encodeLiteral(
        pred.left,
        pred.right,
        sources,
        dialectId,
      );

      return { ...pred, left, right };
    }

    if (pred._tag === 'In') {
      const values = yield* Effect.forEach(pred.values, (expr) =>
        encodeLiteral(pred.left, expr, sources, dialectId),
      );

      return { ...pred, values };
    }

    if (pred._tag === 'Between' && pred.expr._tag === 'Column') {
      const min = yield* encodeLiteral(pred.expr, pred.min, sources, dialectId);
      const max = yield* encodeLiteral(pred.expr, pred.max, sources, dialectId);

      return Q.between(pred.expr, min, max);
    }

    return pred;
  });

const encodeRow = (
  row: Record<string, Expr>,
  writeCodec: Record<string, AnyCodec>,
) =>
  Effect.gen(function* () {
    const encodedRow = { ...row };

    for (const [k, v] of Object.entries(row)) {
      if (v._tag === 'Literal' && v.value !== null) {
        const codec = writeCodec[k];
        if (codec) {
          const encoder = codec.encode as (v: unknown) => unknown;

          encodedRow[k] = yield* Effect.try({
            try: () => Q.lit(encoder(v.value)),
            catch: (cause) =>
              new CodecError({ cause, value: v.value, column: k }),
          });
        }
      }
    }

    return encodedRow;
  });

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

    if (preparedStm._tag === 'Select') {
      if (preparedStm.where !== undefined) {
        const newPred = yield* encodePredicate(
          preparedStm.where,
          sources,
          driver.dialect.id,
        );
        preparedStm = {
          ...preparedStm,
          where: newPred,
        };
      }

      if (preparedStm.joins.length > 0) {
        const joins = yield* Effect.forEach(preparedStm.joins, (j) =>
          encodePredicate(j.on, sources, driver.dialect.id).pipe(
            Effect.map((on) => ({
              ...j,
              on,
            })),
          ),
        );
        preparedStm = {
          ...preparedStm,
          joins,
        };
      }
    }

    if (stmt._tag === 'Insert' && table !== undefined) {
      const writeCodec: Record<string, AnyCodec> = prepareCodecs(
        table._columns,
        driver.dialect.id,
      );

      const encodedRows: Array<InsertIR['rows'][number]> =
        yield* Effect.forEach(stmt.rows, (r) => encodeRow(r, writeCodec));

      preparedStm = { ...stmt, rows: encodedRows };
    }

    if (preparedStm._tag === 'Update' && table !== undefined) {
      const writeCodec: Record<string, AnyCodec> = prepareCodecs(
        table._columns,
        driver.dialect.id,
      );

      const set: Record<string, Expr> = yield* encodeRow(
        { ...preparedStm.set },
        writeCodec,
      );

      preparedStm = { ...preparedStm, set };

      if (preparedStm.where !== undefined) {
        const newPred = yield* encodePredicate(
          preparedStm.where,
          sources,
          driver.dialect.id,
        );

        preparedStm = { ...preparedStm, where: newPred };
      }
    }

    if (preparedStm._tag === 'Delete' && table !== undefined) {
      if (preparedStm.where !== undefined) {
        const newPred = yield* encodePredicate(
          preparedStm.where,
          sources,
          driver.dialect.id,
        );

        preparedStm = { ...preparedStm, where: newPred };
      }
    }

    if (preparedStm._tag === 'Select') {
      preparedStm = optimizeSelect(preparedStm);
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
