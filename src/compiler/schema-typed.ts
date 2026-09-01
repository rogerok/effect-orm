import type {
  DeleteIR,
  Expr as ExprIR,
  InsertIR,
  Predicate as PredIR,
  SelectIR,
  UpdateIR,
} from '#compiler/ir.js';

import * as Q from '#compiler/ir.js';

declare const Brand: unique symbol;

export type Expr<T = unknown> = { readonly [Brand]?: T } & ExprIR;
export type Pred = { readonly [Brand]?: 'predicate' } & PredIR;

export type Select<R> = {
  readonly [Brand]?: { kind: 'select'; result: R };
} & SelectIR;
export type Update<R> = {
  readonly [Brand]?: { kind: 'update'; result: R };
} & UpdateIR;
export type Insert<R> = {
  readonly [Brand]?: { kind: 'insert'; result: R };
} & InsertIR;
export type Delete<R> = {
  readonly [Brand]?: { kind: 'delete'; result: R };
} & DeleteIR;

export type Statement<R = unknown> =
  Delete<R> | Insert<R> | Select<R> | Update<R>;
