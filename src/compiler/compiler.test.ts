import { expect } from 'vitest';

import type { SelectIR } from '#compiler/ir.js';

import { compile } from '#compiler/compiler.js';
import { between, col, lit } from '#compiler/ir-constructors.js';
import { PgDialect } from '#dialect.js';

describe('Predicate Between test', () => {
  it('Should return valid params and sql', () => {
    const select: SelectIR = {
      _tag: 'Select',
      orderBy: [],
      columns: '*',
      joins: [],
      from: {
        table: 'users',
      },
      where: between(col('age', 'users'), lit(18), lit(65)),
    };

    const compiled = compile(select, PgDialect);

    expect(compiled).toEqual({
      sql: 'SELECT * FROM "users" WHERE "users"."age" BETWEEN $1 AND $2',
      params: [18, 65],
    });
  });
});
