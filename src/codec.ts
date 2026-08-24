import type { DialectId } from '#dialect.js';

import { isPostgresDialect } from '#dialect.js';

export interface Codec<TS, SQL> {
  readonly decode: (value: SQL) => TS;
  readonly encode: (value: TS) => SQL;
}

export const passthrough: Codec<unknown, unknown> = {
  encode: (v) => v,
  decode: (v) => v,
};

// Boolean: PG passthrough, SQLite bool <-> int
export const booleanCodec = (dialectId: DialectId): Codec<boolean, unknown> =>
  isPostgresDialect(dialectId)
    ? (passthrough as Codec<boolean, unknown>)
    : {
        encode: (v) => (v ? 1 : 0),
        decode: (raw) => raw === 1 || raw === '1' || raw == true,
      };

// Date: PG нативный Date, SQLite ISO string
export const dateCodec = (
  dialectId: 'postgres' | 'sqlite',
): Codec<Date, unknown> =>
  isPostgresDialect(dialectId)
    ? (passthrough as Codec<Date, unknown>)
    : {
        encode: (v) => v.toISOString(),
        decode: (raw) => new Date(raw as string),
      };

// JSON: PG jsonb passthrough, SQLite TEXT
export const jsonCodec = <T>(dialectId: DialectId): Codec<T, unknown> =>
  isPostgresDialect(dialectId)
    ? (passthrough as Codec<T, unknown>)
    : {
        encode: (v) => JSON.stringify(v),
        decode: (raw) => JSON.parse(raw as string) as T,
      };

// BigInt: спорный кейс, лучше явно
export const bigintCodec: Codec<bigint, unknown> = {
  encode: (v) => v.toString(),
  decode: (raw) => BigInt(raw as number | string),
};
