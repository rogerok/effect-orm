import type { Expr, Pred } from '#query/typed-ast.js';
import type { ColumnDef, SqlType } from '#schema/columns.js';
import type { InferColumn } from '#schema/infer.js';
import type { TableDef } from '#schema/table.js';

import { lit } from '#query/expressions.js';
import {
  and,
  between,
  bool,
  eq,
  gt,
  gte,
  isIn,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  neq,
  not,
  or,
} from '#query/predicates.js';

export type SourceMap = Record<
  string,
  TableDef<string, Record<string, ColumnDef<SqlType, boolean, boolean>>>
>;

export interface ExpressionBuilder<S extends SourceMap> {
  and: (...preds: Pred[]) => Pred;
  between: <T>(expr: Expr<T>, min: Expr<T>, max: Expr<T>) => Pred;
  bool: (value: boolean) => Pred;
  col: <A extends keyof S & string, C extends keyof S[A]['_columns'] & string>(
    alias: A,
    column: C,
  ) => Expr<InferColumn<S[A]['_columns'][C]>>;
  eq: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  gt: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  gte: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  isIn: <T>(l: Expr<T>, vs: ReadonlyArray<Expr<T>>) => Pred;
  isNotNull: (e: Expr<unknown>) => Pred;
  isNull: (e: Expr<unknown>) => Pred;
  like: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  lit: <T>(value: T) => Expr<T>;
  lt: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  lte: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  neq: <T>(l: Expr<T>, r: Expr<T>) => Pred;
  not: (p: Pred) => Pred;

  or: (...preds: Pred[]) => Pred;
}

export const makeExpressionBuilder = <
  S extends SourceMap,
>(): ExpressionBuilder<S> => ({
  col: (alias, column) => ({ table: alias, _tag: 'Column', name: column }),
  lit: lit,
  gte,
  lte,
  neq,
  lt,
  eq,
  gt,
  isNotNull,
  isNull,
  not,
  or,
  and,
  bool,
  between,
  isIn,
  like,
});
