import { Effect } from 'effect';

import { and, col, gt, isNotNull, lit, select } from '#query/index.js';
import { insert } from '#query/statements.js';
import { run } from '#query/typed-run.js';
import { integer, nullable, primaryKey, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

const users = table('users', {
  id: primaryKey(integer()),
  name: text(),
  email: text(),
  age: nullable(integer()),
});

const program = Effect.gen(function* () {
  const adults = yield* run(
    select(users, ['id', 'name'] as const, {
      where: and(
        gt(col(users, 'age'), lit(18)),
        isNotNull(col(users, 'email')),
      ),
      orderBy: [{ expr: col(users, 'name'), dir: 'asc' }],
      limit: 100,
    }),
  );

  const [created] = yield* run(
    insert(users, [{ name: 'Name', email: 'example@mail.com', age: 30 }], {
      returning: ['id'] as const,
    }),
  );

  if (created) {
    return { adults, createdId: created.id };
  } else {
    return yield* Effect.fail('id not found');
  }
});
