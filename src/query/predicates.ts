import type { Expr, Pred } from '#query/typed-ast.js';

type BinopTag = 'Eq' | 'Gt' | 'Gte' | 'Like' | 'Lt' | 'Lte' | 'Neq';

const binop =
  <Tag extends BinopTag>(_tag: Tag) =>
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

export const and = (...preds: Pred[]): Pred => ({ _tag: 'And', preds }) as Pred;
export const or = (...preds: Pred[]): Pred => ({ _tag: 'Or', preds }) as Pred;
export const not = (p: Pred): Pred => ({ _tag: 'Not', pred: p }) as Pred;

export const between = <T>(expr: Expr<T>, min: Expr<T>, max: Expr<T>): Pred =>
  ({
    _tag: 'Between',
    expr,
    min,
    max,
  }) as Pred;
