import { expectTypeOf } from 'vitest';

import type { ExecutableQuery, SelectQueryBuilder } from '#query/builder.js';

import { selectFrom } from '#query/builder.js';
import { integer, nullable, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

type SourceOf<Q> = Q extends SelectQueryBuilder<infer B> ? B : never;
type RowOf<Q> = Q extends ExecutableQuery<infer R> ? R : never;
const users = table('users', {
  id: integer(),
  name: text(),
  bio: nullable(text()),
});
const posts = table('posts', {
  id: integer(),
  userId: integer(),
  title: text(),
});
const comments = table('comments', {
  id: integer(),
  postId: integer(),
  body: text(),
});

const query = selectFrom(users, 'u')
  .innerJoin(posts, 'p', (b) => b.eq(b.col('p', 'userId'), b.col('u', 'id')))
  .leftJoin(comments, 'c', (b) => b.eq(b.col('c', 'postId'), b.col('p', 'id')));

const query2 = selectFrom(users, 'u')
  .innerJoin(posts, 'p', (b) => b.eq(b.col('p', 'userId'), b.col('u', 'id')))
  .leftJoin(comments, 'c', (b) => b.eq(b.col('c', 'postId'), b.col('p', 'id')))
  .select((b) => ({
    userId: b.col('p', 'userId'),
    userBio: b.col('u', 'bio'),
    postId: b.col('c', 'postId'),
  }));

export type Sources = SourceOf<typeof query>;
export type Sources2 = RowOf<typeof query2>;

describe('E3.2', () => {
  it('types nullability', () => {
    expectTypeOf<Sources['u']['nullable']>().toEqualTypeOf<false>();
    expectTypeOf<Sources['p']['nullable']>().toEqualTypeOf<false>();
    expectTypeOf<Sources['c']['nullable']>().toEqualTypeOf<true>();
  });

  it('types nullability 2', () => {
    expectTypeOf<Sources2['userId']>().toEqualTypeOf<number>();
    expectTypeOf<Sources2['userBio']>().toEqualTypeOf<string | null>();
    expectTypeOf<Sources2['postId']>().toEqualTypeOf<number | null>();
  });
});
