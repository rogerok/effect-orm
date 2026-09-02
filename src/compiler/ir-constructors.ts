import type { Expr, Predicate } from '#compiler/ir.js';

export const col = (name: string, table?: string): Expr => ({
  _tag: 'Column',
  name,
  table,
});
export const lit = (value: unknown): Expr => ({ _tag: 'Literal', value });

export const eq = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Eq',
  left: l,
  right: r,
});
export const neq = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Neq',
  left: l,
  right: r,
});
export const gt = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Gt',
  left: l,
  right: r,
});
export const gte = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Gte',
  left: l,
  right: r,
});
export const lt = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Lt',
  left: l,
  right: r,
});
export const lte = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Lte',
  left: l,
  right: r,
});
export const like = (l: Expr, r: Expr): Predicate => ({
  _tag: 'Like',
  left: l,
  right: r,
});
export const isIn = (l: Expr, vs: ReadonlyArray<Expr>): Predicate => ({
  _tag: 'In',
  left: l,
  values: vs,
});
export const isNull = (e: Expr): Predicate => ({
  _tag: 'IsNull',
  expr: e,
  negate: false,
});
export const isNotNull = (e: Expr): Predicate => ({
  _tag: 'IsNull',
  expr: e,
  negate: true,
});
export const and = (...preds: Predicate[]): Predicate => ({
  _tag: 'And',
  preds,
});
export const or = (...preds: Predicate[]): Predicate => ({
  _tag: 'Or',
  preds,
});
export const not = (p: Predicate): Predicate => ({ _tag: 'Not', pred: p });

export const between = (expr: Expr, min: Expr, max: Expr): Predicate => ({
  _tag: 'Between',
  min,
  max,
  expr,
});
