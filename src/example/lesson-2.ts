import { Effect } from 'effect';

import * as Q from '#query/index.js';
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
    Q.select(users, ['id', 'name'] as const, {
      where: Q.and(
        Q.gt(Q.col(users, 'age'), Q.lit(18)),
        Q.isNotNull(Q.col(users, 'email')),
      ),
      orderBy: [{ expr: Q.col(users, 'name'), dir: 'asc' }],
      limit: 100,
    }),
  );

  const [created] = yield* run(
    Q.insert(users, [{ name: 'Name', email: 'example@mail.com', age: 30 }], {
      returning: ['id'] as const,
    }),
  );

  if (created) {
    return { adults, createdId: created.id };
  } else {
    return yield* Effect.fail('id not found');
  }
});
