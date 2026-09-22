import type { ColumnDef, SqlType } from '#schema/columns.js';

type SoftDeleteKeyName<
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
> = {
  [K in keyof Cols & string]: Cols[K]['_pk'] extends false
    ? Cols[K]['_nullable'] extends true
      ? Cols[K]['_type'] extends 'timestamp'
        ? K
        : never
      : never
    : never;
}[keyof Cols & string];

type VersionKeyName<
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
> = {
  [K in keyof Cols & string]: Cols[K]['_pk'] extends false
    ? Cols[K]['_nullable'] extends false
      ? Cols[K]['_type'] extends 'integer'
        ? K
        : never
      : never
    : never;
}[keyof Cols & string];

interface TableDefOptions<
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
> {
  readonly deletedAtColumn?: SoftDeleteKeyName<Cols> | undefined;
  readonly versionColumn?: VersionKeyName<Cols> | undefined;
}

export interface TableDef<
  Name extends string,
  Cols extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
> {
  readonly _columns: Cols;
  readonly _name: Name;
  readonly _options?: TableDefOptions<Cols> | undefined;
}

export const table = <
  N extends string,
  C extends Record<string, ColumnDef<SqlType, boolean, boolean>>,
>(
  name: N,
  columns: C,
  options?: TableDefOptions<C> | undefined,
): TableDef<N, C> => ({
  _name: name,
  _columns: columns,
  _options: options,
});

export interface AnyTableDef {
  readonly _columns: Record<string, ColumnDef<SqlType, boolean, boolean>>;
  readonly _name: string;
  readonly _options?:
    | {
        readonly deletedAtColumn?: string | undefined;
        readonly versionColumn?: string | undefined;
      }
    | undefined;
}
