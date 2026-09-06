import type { DeleteIR, InsertIR, SelectIR, UpdateIR } from '#compiler/ir.js';

import * as IR from '#compiler/ir-constructors.js';
import { prettyPrint } from '#compiler/pretty-printer.js';

describe('pretty printer test', () => {
  it('selection printing', () => {
    const ir: SelectIR = {
      _tag: 'Select',
      joins: [],
      columns: [
        {
          expr: IR.col('id'),
        },
        {
          expr: IR.col('name'),
        },
      ],
      orderBy: [{ expr: IR.col('name'), dir: 'asc' }],
      from: {
        table: 'users',
      },
      limit: 10,
      where: IR.gt(IR.col('age'), IR.lit(18)),
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"SELECT id, name FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10"`,
    );
  });

  it('selection printing with join', () => {
    const columns: SelectIR['columns'] = [
      {
        expr: IR.col('id', 'u'),
        alias: 'userId',
      },
      {
        expr: IR.col('title', 'p'),
        alias: 'postTitle',
      },
    ];

    const joins: SelectIR['joins'] = [
      {
        kind: 'inner',
        table: 'posts',
        alias: 'p',
        on: IR.eq(IR.col('id', 'u'), IR.col('userId', 'p')),
      },
    ];

    const where = IR.and(
      IR.like(IR.col('name', 'u'), IR.lit("%O'Reilly%")),
      IR.not(IR.isNull(IR.col('title', 'p'))),
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
      { name: IR.lit('Alice'), active: IR.lit(true), nickname: IR.lit(null) },
      {
        name: IR.lit("O'Reilly"),
        active: IR.lit(false),
        nickname: IR.lit(null),
      },
    ];

    const returning: InsertIR['returning'] = [{ expr: IR.col('id') }];

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
        active: IR.lit(false),
        name: IR.lit('Bob'),
      },
      where: IR.isIn(IR.col('id'), [IR.lit(1), IR.lit(2)]),
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
      where: IR.or(
        IR.between(IR.col('age'), IR.lit(18), IR.lit(65)),
        IR.isNotNull(IR.col('deleted_at')),
      ),
    };

    expect(prettyPrint(ir)).toMatchInlineSnapshot(
      `"DELETE FROM users WHERE (age BETWEEN 18 AND 65) OR (deleted_at IS NOT NULL)"`,
    );
  });
});
