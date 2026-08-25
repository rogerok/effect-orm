import { describe, expect, expectTypeOf, it } from 'vitest';

import { PgDialect, SqliteDialect } from '#dialect.js';
import { nullable, varchar } from '#schema/columns.js';

const column = varchar(32);
const nullableColumn = nullable(column);

describe('E1 3.', () => {
  it('varchar', () => {
    expect(PgDialect.mapColumnType('varchar', { length: 255 })).toBe(
      'VARCHAR(255)',
    );
    expect(SqliteDialect.mapColumnType('varchar', { length: 32 })).toBe(
      'VARCHAR(32)',
    );

    expectTypeOf(nullableColumn._length).toEqualTypeOf<32>();
  });
});
