import { selectFrom } from '#query/builder.js';
import { col } from '#query/index.js';
import { integer, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

const users = table('users', {
  id: integer(),
  name: text(),
});

const posts = table('posts', {
  id: integer(),
  userId: integer(),
  text: text(),
});

//@ts-expect-error
export const queryInnerJoin = selectFrom(users, 'u')
  .innerJoin(posts, 'p', (b) => b.gt(col(users, 'id'), b.lit(1)))
  .selectAll();
//@ts-expect-error
export const queryLeftJoin = selectFrom(users, 'u')
  .innerJoin(posts, 'p', (b) => b.gt(b.col('u', 'id'), b.lit(1)))
  .selectAll();

export const query = selectFrom(users, 'u').selectAll();
export const queryWhere = selectFrom(users, 'u')
  .where((b) => b.gt(b.col('u', 'id'), b.lit(2)))
  .selectAll();
