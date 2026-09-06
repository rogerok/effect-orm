import { Effect, Exit, Request, RequestResolver } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';

import { col, isIn, lit, selectAll } from '#query/index.js';
import { run } from '#query/typed-run.js';
import { integer, nullable, primaryKey, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

const usersTable = table('users', {
  id: primaryKey(integer()),
  age: nullable(integer()),
});

interface User {
  age: number | null;
  id: number;
}

export class GetUserById extends Request.TaggedClass('GetUserById')<
  {
    readonly id: number;
  },
  User | null,
  DriverError,
  Driver
> {}

export const UserByIdResolver = RequestResolver.make<GetUserById>((entries) =>
  Effect.gen(function* () {
    const ids = entries.map((entry) => entry.request.id);
    const users = yield* run(
      selectAll(usersTable, {
        where: isIn(col(usersTable, 'id'), ids.map(lit)),
      }),
    ).pipe(Effect.provideContext(entries[0].context));

    const byId = new Map(users.map((u) => [u.id, u]));

    for (const entry of entries) {
      entry.completeUnsafe(Exit.succeed(byId.get(entry.request.id) ?? null));
    }
  }),
);

const postsTable = table('posts', {
  userId: integer(),
  content: text(),
  id: primaryKey(integer()),
});

interface Post {
  content: string;
  id: number;
  userId: number;
}

/*
E2.6. Реализовать DataLoader для batch fetch posts by userId. Сейчас getUserById берёт один user.
Сделать getPostsByUserId(userId): Effect<Post[], _, _> через RequestResolver.make.
Подвох: один userId -> много posts, нужен groupBy в resolver’е.
 */

export class GetPostsByUserId extends Request.TaggedClass('GetPostsByUserId')<
  { readonly userId: number },
  Post[],
  DriverError,
  Driver
> {}

export const PostsByUserIdResolver = RequestResolver.make<GetPostsByUserId>(
  (entries) =>
    Effect.gen(function* () {
      const ids = entries.map((entry) => entry.request.userId);
      const posts = yield* run(
        selectAll(postsTable, {
          where: isIn(col(postsTable, 'userId'), ids.map(lit)),
        }),
      ).pipe(Effect.provideContext(entries[0].context));

      const byId = posts.reduce<Record<number, Post[]>>((acc, post) => {
        const userPosts = acc[post.userId];

        if (userPosts) {
          userPosts.push(post);
        } else {
          acc[post.userId] = [post];
        }

        return acc;
      }, {});

      for (const entry of entries) {
        entry.completeUnsafe(Exit.succeed(byId[entry.request.userId] ?? []));
      }
    }),
);

export const getPostsByUserId = (id: number) =>
  Effect.request(new GetPostsByUserId({ userId: id }), PostsByUserIdResolver);
