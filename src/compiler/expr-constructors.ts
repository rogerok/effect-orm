import type { Expr, Pred } from '#compiler/schema-typed.js';
import type { ColumnDef } from '#schema/columns.js';
import type { InferColumn } from '#schema/infer.js';
import type { TableDef } from '#schema/table.js';

export const col = <
  T extends TableDef<string, Record<string, ColumnDef>>,
  K extends keyof T['_columns'] & string,
>(
  table: T,
  name: K,
): Expr<InferColumn<T['_columns'][K]>> =>
  ({ _tag: 'Column', table: table._name, name }) as Expr<
    InferColumn<T['_columns'][K]>
  >;

export const lit = <T>(value: T): Expr<T> =>
  ({ _tag: 'Literal', value }) as Expr<T>;

const binop =
  <Tag extends 'Eq' | 'Gt' | 'Gte' | 'Like' | 'Lt' | 'Lte' | 'Neq'>(
    _tag: Tag,
  ) =>
  <T>(l: Expr<T>, r: Expr<T>): Pred =>
    ({ _tag, left: l, right: r }) as Pred;

export const eq = binop('Eq');
export const neq = binop('Neq');
export const gt = binop('Gt');
export const gte = binop('Gte');
export const lt = binop('Lt');
export const lte = binop('Lte');
export const like = binop('Like');

export const isIn = <T>(l: Expr<T>, vs: ReadonlyArray<Expr<T>>): Pred =>
  ({ _tag: 'In', left: l, values: vs }) as Pred;

export const isNull = (e: Expr<unknown>): Pred => ({
  _tag: 'IsNull',
  expr: e,
  negate: false,
});
export const isNotNull = (e: Expr<unknown>): Pred =>
  ({
    _tag: 'IsNull',
    expr: e,
    negate: true,
  }) as Pred;

const and = (...preds: Pred[]): Pred => ({ _tag: 'And', preds }) as Pred;
const or = (...preds: Pred[]): Pred => ({ _tag: 'Or', preds }) as Pred;
export const not = (p: Pred): Pred => ({ _tag: 'Not', pred: p }) as Pred;
