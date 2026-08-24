import type { ColumnDef } from '#schema/columns.js';

export interface TableDef<
  Name extends string,
  Cols extends Record<string, ColumnDef>,
> {
  readonly _columns: Cols;
  readonly _name: Name;
}

export const table = <N extends string, C extends Record<string, ColumnDef>>(
  name: N,
  columns: C,
): TableDef<N, C> => ({ _name: name, _columns: columns });
