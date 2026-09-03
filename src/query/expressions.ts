import type { Expr } from '#query/typed-ast.js';
import type { ColumnDef, SqlType } from '#schema/columns.js';
import type { InferColumn } from '#schema/infer.js';
import type { TableDef } from '#schema/table.js';

export const col = <
  T extends TableDef<
    string,
    Record<string, ColumnDef<SqlType, boolean, boolean>>
  >,
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
