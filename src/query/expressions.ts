import type { Expr } from '#query/typed-ast.js';
import type { InferColumn } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

export const col = <
  T extends AnyTableDef,
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
