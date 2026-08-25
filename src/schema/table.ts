import type { ColumnDef, SqlType } from '#schema/columns.js';

export interface TableDef<
  Name extends string,
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
> {
  readonly _columns: Cols;
  readonly _name: Name;
}

export const table = <
  N extends string,
  C extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
>(
  name: N,
  columns: C,
): TableDef<N, C> => ({ _name: name, _columns: columns });
