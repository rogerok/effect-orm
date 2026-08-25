import type { ColumnDef } from '#schema/columns.js';
import type { TableDef } from '#schema/table.js';

export interface SqlToTs {
  blob: Uint8Array;
  boolean: boolean;
  integer: number;
  real: number;
  text: string;
}

export type InferColumn<C extends ColumnDef> = C['_nullable'] extends true
  ? SqlToTs[C['_type']] | null
  : SqlToTs[C['_type']];

// oxlint-disable-next-line typescript/no-explicit-any
export type InferRow<T extends TableDef<string, any>> = {
  [K in keyof T['_columns']]: InferColumn<T['_columns'][K]>;
};

// oxlint-disable-next-line typescript/no-explicit-any
export type InferInsert<T extends TableDef<string, any>> = {
  [
    K in keyof T['_columns'] as T['_columns'][K]['_pk'] extends true
      ? K
      : T['_columns'][K]['_hasDefault'] extends true
        ? K
        : never
  ]?: InferColumn<T['_columns'][K]>;
} & {
  [
    K in keyof T['_columns'] as T['_columns'][K]['_pk'] extends true
      ? never
      : T['_columns'][K]['_hasDefault'] extends true
        ? never
        : K
  ]: InferColumn<T['_columns'][K]>;
};
