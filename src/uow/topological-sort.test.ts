import { describe, it } from '@effect/vitest';

import type { Edge } from '#uow/topological-sort.js';

import { expectFailure, expectSuccess } from '#config/result-matchers.js';
import { CyclicDependencyError } from '#errors/errors.js';
import { integer, nullable, primaryKey, text } from '#schema/columns.js';
import { relations } from '#schema/relations.js';
import { table } from '#schema/table.js';
import { insertOrderEdges, topologicalSort } from '#uow/topological-sort.js';

describe('topological sort', () => {
  it('places every table before its dependents', () => {
    const tablesList = {
      users: 'users',
      posts: 'posts',
      comments: 'comments',
      tags: 'tags',
    } as const;

    const tables = [
      tablesList.users,
      tablesList.tags,
      tablesList.posts,
      tablesList.comments,
    ] as const;

    const edges: ReadonlyArray<Edge> = [
      [tablesList.users, tablesList.posts],
      [tablesList.users, tablesList.comments],
      [tablesList.posts, tablesList.comments],
    ];

    const result = expectSuccess(topologicalSort(tables, edges));

    expect([...result].sort()).toEqual([...tables].sort());

    for (const [from, to] of edges) {
      expect(result.indexOf(from)).toBeLessThan(result.indexOf(to));
    }
  });
  it('returns CyclicDependencyError with the tables that cannot be ordered', () => {
    const tablesList = {
      users: 'users',
      posts: 'posts',
      teams: 'teams',
      tags: 'tags',
    } as const;

    const tables = [
      tablesList.users,
      tablesList.tags,
      tablesList.posts,
      tablesList.teams,
    ] as const;

    const edges: ReadonlyArray<Edge> = [
      [tablesList.users, tablesList.teams],
      [tablesList.teams, tablesList.users],
      [tablesList.users, tablesList.posts],
    ];

    const result = expectFailure(topologicalSort(tables, edges));

    expect(result).toBeInstanceOf(CyclicDependencyError);
    expect([...result.tables].sort()).toEqual([
      tablesList.posts,
      tablesList.teams,
      tablesList.users,
    ]);
  });

  it('places a table after all of its parents', () => {
    const tablesList = {
      users: 'users',
      sections: 'sections',
      categories: 'categories',
      posts: 'posts',
    } as const;

    const tables = [
      tablesList.users,
      tablesList.sections,
      tablesList.categories,
      tablesList.posts,
    ] as const;

    // posts ждёт двух родителей; categories готова позже users,
    // поэтому posts нельзя выводить после одного только users.
    const edges: ReadonlyArray<Edge> = [
      [tablesList.categories, tablesList.posts],
      [tablesList.sections, tablesList.categories],
      [tablesList.users, tablesList.posts],
    ];

    const result = expectSuccess(topologicalSort(tables, edges));

    expect([...result].sort()).toEqual([...tables].sort());

    for (const [from, to] of edges) {
      expect(result.indexOf(from)).toBeLessThan(result.indexOf(to));
    }
  });

  it('builds an edge from the owner table to the target table of each relation', () => {
    const cascadeUsers = table('cascade_users', {
      id: primaryKey(integer()),
      name: text(),
    });

    const cascadePosts = table('cascade_posts', {
      postId: primaryKey(integer()),
      authorId: integer(),
    });

    const cascadeComments = table('cascade_comments', {
      commentId: primaryKey(integer()),
      userId: integer(),
      body: text(),
    });

    const userRelations = relations(cascadeUsers, ({ many }) => ({
      posts: many(cascadePosts, {
        onDelete: 'cascade',
        columns: { id: 'authorId' },
      }),
      comments: many(cascadeComments, {
        onDelete: 'cascade',
        columns: { id: 'userId' },
      }),
    }));

    const edges = insertOrderEdges([userRelations]);

    expect(edges).toEqual([
      ['cascade_users', 'cascade_posts'],
      ['cascade_users', 'cascade_comments'],
    ]);
  });

  it('skips the edge for a self-referencing relation', () => {
    const users = table('users', {
      id: primaryKey(integer()),
      name: text(),
      managerId: nullable(integer()),
    });

    const posts = table('posts', {
      postId: primaryKey(integer()),
      authorId: integer(),
    });

    const userRelations = relations(users, ({ many }) => ({
      reports: many(users, {
        onDelete: 'no action',
        columns: { id: 'managerId' },
      }),
      posts: many(posts, {
        onDelete: 'cascade',
        columns: { id: 'authorId' },
      }),
    }));

    const edges = insertOrderEdges([userRelations]);
    expect(edges).toEqual([['users', 'posts']]);
  });
});
