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
  readonly _codec?: (dialectId: DialectId) => Codec<unknown, unknown>;
}

export const withCodec = <T, S, C extends ColumnDef>(
  c: C,
  codecFn: (d: 'postgres' | 'sqlite') => Codec<T, S>,
): C => ({ ...c, _codec: codecFn as never });

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
export const nullable = <T extends SqlType, PK extends boolean>(
  c: ColumnDef<T, false, PK>,
): ColumnDef<T, true, PK> => ({ ...c, _nullable: true });

export const primaryKey = <T extends SqlType, N extends boolean>(
  c: ColumnDef<T, N, false>,
): ColumnDef<T, N, true> => ({ ...c, _pk: true });
