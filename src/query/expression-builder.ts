import type { Expr, Pred } from '#query/typed-ast.js';
import type { InferColumn } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

import { ExprTypeId } from '#compiler/ir.js';
import * as Q from '#query/index.js';

export type Source<T extends AnyTableDef, B extends boolean> = {
  nullable: B;
  table: T;
};

export type SourceMap = Record<string, Source<AnyTableDef, boolean>>;

export interface ExpressionBuilder<S extends SourceMap> {
  and: (...preds: Pred[]) => Pred;
  between: <T>(expr: Expr<T>, min: Expr<T>, max: Expr<T>) => Pred;
  bool: (value: boolean) => Pred;
  col: <
    A extends keyof S & string,
    C extends keyof S[A]['table']['_columns'] & string,
  >(
    alias: A,
    column: C,
  ) => Expr<
    S[A]['nullable'] extends true
      ? InferColumn<S[A]['table']['_columns'][C]> | null
      : InferColumn<S[A]['table']['_columns'][C]>
  >;

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
  now: () => Expr<Date>;
  or: (...preds: Pred[]) => Pred;
}

export const makeExpressionBuilder = <
  S extends SourceMap,
>(): ExpressionBuilder<S> => ({
  col: (alias, column) => ({
    table: alias,
    _tag: 'Column',
    name: column,
    [ExprTypeId]: true,
  }),
  now: Q.now,
  lit: Q.lit,
  gte: Q.gte,
  lte: Q.lte,
  neq: Q.neq,
  lt: Q.lt,
  eq: Q.eq,
  gt: Q.gt,
  isNotNull: Q.isNotNull,
  isNull: Q.isNull,
  not: Q.not,
  or: Q.or,
  and: Q.and,
  bool: Q.bool,
  between: Q.between,
  isIn: Q.isIn,
  like: Q.like,
});
