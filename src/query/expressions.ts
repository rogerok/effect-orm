import type { Expr } from '#query/typed-ast.js';
import type { InferColumn } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

import { ExprTypeId } from '#compiler/ir.js';

export const col = <
  T extends AnyTableDef,
  K extends keyof T['_columns'] & string,
>(
  table: T,
  name: K,
): Expr<InferColumn<T['_columns'][K]>> =>
  ({ _tag: 'Column', table: table._name, name, [ExprTypeId]: true }) as Expr<
    InferColumn<T['_columns'][K]>
  >;

export const lit = <T>(value: T): Expr<T> =>
  ({ _tag: 'Literal', value, [ExprTypeId]: true }) as Expr<T>;

export const now = (): Expr<Date> => ({ _tag: 'Now', [ExprTypeId]: true });

export const isExpr = (v: unknown): v is Expr<unknown> =>
  typeof v === 'object' &&
  v !== null &&
  ExprTypeId in v &&
  v[ExprTypeId] === true;
