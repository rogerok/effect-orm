import type { Codec } from '#codec.js';
import type { DialectId } from '#dialect.js';

import { jsonCodec } from '#codec.js';
import { dateCodec } from '#codec.js';
import { booleanCodec } from '#codec.js';

export type SqlType = 'blob' | 'boolean' | 'integer' | 'real' | 'text';

export interface ColumnDef<
  T extends SqlType = SqlType,
  Null extends boolean = false,
  PK extends boolean = false,
> {
  readonly _nullable: Null;
  readonly _pk: PK;
  readonly _type: T;
  readonly _default?: unknown;
  readonly _hasDefault?: boolean;
  readonly _length?: number;
  readonly _codec?: (dialectId: DialectId) => Codec<unknown, unknown>;
}

export const withCodec = <T, S, C extends ColumnDef>(
  c: C,
  codecFn: (d: 'postgres' | 'sqlite') => Codec<T, S>,
): C => ({ ...c, _codec: codecFn as never });

export const withDefault = <C extends ColumnDef>(
  c: C,
  value: unknown,
): {
  _default: unknown;
  _hasDefault: true;
} & C => ({
  ...c,
  _default: value,
  _hasDefault: true,
});

// Smart constructors
export const integer = (): ColumnDef<'integer', false, false> => ({
  _nullable: false,
  _pk: false,
  _type: 'integer',
});

export const text = (): ColumnDef<'text', false, false> => ({
  _nullable: false,
  _pk: false,
  _type: 'text',
});

export const real = (): ColumnDef<'real', false, false> => ({
  _nullable: false,
  _pk: false,
  _type: 'real',
});

export const varchar = <N extends number>(
  n: N,
): { _length: N } & ColumnDef<'text', false, false> => ({
  _nullable: false,
  _pk: false,
  _type: 'text',
  _length: n,
});

export const bool = (): ColumnDef<'boolean', false, false> =>
  withCodec(
    {
      _nullable: false,
      _pk: false,
      _type: 'boolean',
    },
    booleanCodec,
  );

export const timestamp = (): ColumnDef<'text', false, false> =>
  withCodec({ _type: 'text', _nullable: false, _pk: false }, dateCodec);

export const json = <T>(): ColumnDef<'text', false, false> =>
  withCodec({ _type: 'text', _nullable: false, _pk: false }, jsonCodec<T>);

// Modifiers
export const nullable = <C extends ColumnDef<SqlType, false, boolean>>(
  c: C,
): { readonly _nullable: true } & Omit<C, '_nullable'> => ({
  ...c,
  _nullable: true,
});

export const primaryKey = <C extends ColumnDef<SqlType, boolean, false>>(
  c: C,
): { readonly _pk: true } & Omit<C, '_pk'> => ({ ...c, _pk: true });
