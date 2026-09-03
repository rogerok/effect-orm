import type { DeleteIR, InsertIR, SelectIR, UpdateIR } from '#compiler/ir.js';

import {
  and,
  between,
  col,
  eq,
  gt,
  isIn,
  isNotNull,
  isNull,
  like,
  lit,
  not,
  or,
} from '#compiler/ir-constructors.js';
import { prettyPrint } from '#compiler/pretty-printer.js';

describe('pretty printer test', () => {
  it('selection printing', () => {
    const ir: SelectIR = {
      _tag: 'Select',
      joins: [],
      columns: [
        {
          expr: col('id'),
        },
        {
          expr: col('name'),
        },
      ],
      orderBy: [{ expr: col('name'), dir: 'asc' }],
      from: {
        table: 'users',
      },
      limit: 10,
      where: gt(col('age'), lit(18)),
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"SELECT id, name FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10"`,
    );
  });

  it('selection printing with join', () => {
    const columns: SelectIR['columns'] = [
      {
        expr: col('id', 'u'),
        alias: 'userId',
      },
      {
        expr: col('title', 'p'),
        alias: 'postTitle',
      },
    ];

    const joins: SelectIR['joins'] = [
      {
        kind: 'inner',
        table: 'posts',
        alias: 'p',
        on: eq(col('id', 'u'), col('userId', 'p')),
      },
    ];

    const where = and(
      like(col('name', 'u'), lit("%O'Reilly%")),
      not(isNull(col('title', 'p'))),
    );

    const ir: SelectIR = {
      _tag: 'Select',
      columns,
      where,
      orderBy: [],
      joins,
      from: { table: 'users', alias: 'u' },
      offset: 0,
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"SELECT u.id AS userId, p.title AS postTitle FROM users AS u INNER JOIN posts AS p ON u.id = p.userId WHERE (u.name LIKE '%O''Reilly%') AND (NOT (p.title IS NULL)) OFFSET 0"`,
    );
  });

  it('insert printing', () => {
    const rows: InsertIR['rows'] = [
      { name: lit('Alice'), active: lit(true), nickname: lit(null) },
      { name: lit("O'Reilly"), active: lit(false), nickname: lit(null) },
    ];

    const returning: InsertIR['returning'] = [{ expr: col('id') }];

    const ir: InsertIR = {
      _tag: 'Insert',
      returning,
      rows,
      into: 'users',
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"INSERT INTO users (name, active, nickname) VALUES ('Alice', TRUE, NULL), ('O''Reilly', FALSE, NULL) RETURNING id"`,
    );
  });

  it('update printing', () => {
    const ir: UpdateIR = {
      _tag: 'Update',
      table: 'users',
      returning: '*',
      set: {
        active: lit(false),
        name: lit('Bob'),
      },
      where: isIn(col('id'), [lit(1), lit(2)]),
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"UPDATE users SET active = FALSE, name = 'Bob' WHERE id IN (1, 2) RETURNING *"`,
    );
  });

  it('delete printing', () => {
    const ir: DeleteIR = {
      _tag: 'Delete',
      returning: null,
      from: 'users',
      where: or(
        between(col('age'), lit(18), lit(65)),
        isNotNull(col('deleted_at')),
      ),
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"DELETE FROM users WHERE (age BETWEEN 18 AND 65) OR (deleted_at IS NOT NULL)"`,
    );
  });
});
