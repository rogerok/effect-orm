import type { Codec } from '#codec.js';
import type { DialectId } from '#dialect.js';
import type { Expr } from '#query/typed-ast.js';
import type { ColumnDef, SqlType } from '#schema/columns.js';
import type { AnyTableDef, TableDef } from '#schema/table.js';

export interface SqlToTs {
  blob: Uint8Array;
  boolean: boolean;
  integer: number;
  json: unknown;
  real: number;
  text: string;
  timestamp: Date;
}

type InferValue<C extends ColumnDef<SqlType, boolean, boolean>> = C extends {
  readonly _codec: (dialectId: DialectId) => Codec<infer TS, infer SQL>;
}
  ? TS
  : SqlToTs[C['_type']];

export type InferColumn<C extends ColumnDef<SqlType, boolean, boolean>> =
  C['_nullable'] extends true ? InferValue<C> | null : InferValue<C>;

// oxlint-disable-next-line typescript/no-explicit-any
export type InferRow<T extends TableDef<string, any>> = {
  [K in keyof T['_columns'] & string]: InferColumn<T['_columns'][K]>;
};

// oxlint-disable-next-line typescript/no-explicit-any
export type InferInsert<T extends TableDef<string, any>> = {
  [
    K in keyof T['_columns'] as T['_columns'][K]['_pk'] extends true
      ? K
      : T['_columns'][K]['_nullable'] extends true
        ? K
        : T['_columns'][K]['_hasDefault'] extends true
          ? K
          : never
  ]?: InferColumn<T['_columns'][K]>;
} & {
  [
    K in keyof T['_columns'] as T['_columns'][K]['_pk'] extends true
      ? never
      : T['_columns'][K]['_nullable'] extends true
        ? never
        : T['_columns'][K]['_hasDefault'] extends true
          ? never
          : K
  ]: InferColumn<T['_columns'][K]>;
};

export type InferUpdate<T extends AnyTableDef> = {
  [
    K in keyof T['_columns'] as T['_columns'][K]['_pk'] extends true ? never : K
  ]?: Expr<InferColumn<T['_columns'][K]>> | InferColumn<T['_columns'][K]>;
};
