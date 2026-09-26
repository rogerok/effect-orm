import { Result } from 'effect';

import type { TableRelations } from '#schema/relations.js';
import type { AnyTableDef } from '#schema/table.js';

import { CyclicDependencyError } from '#errors/errors.js';

export type Edge = readonly [from: string, to: string];

const getQueue = (map: Map<string, number>) => {
  const queue: Array<string> = [];

  for (const [table, degree] of map) {
    if (degree === 0) {
      queue.push(table);
    }
  }
  return queue;
};

export const topologicalSort: (
  tables: ReadonlyArray<string>,
  edges: ReadonlyArray<Edge>,
) => Result.Result<ReadonlyArray<string>, CyclicDependencyError> = (
  tables,
  edges,
) => {
  // Для каждой таблицы: сколько ещё не выведенных таблиц должны идти раньше неё.
  // Ключ — таблица, значение — число входящих рёбер (in-degree).
  // Пример: comments → 2 (ждёт users и posts).
  const inDegree = new Map<string, number>();

  // Для каждой таблицы: какие таблицы зависят от неё.
  // Ключ — таблица, значение — концы её исходящих рёбер.
  // Пример: users → ['posts', 'comments']
  const adjacency = new Map<string, Array<string>>();

  for (const table of tables) {
    inDegree.set(table, 0);
    adjacency.set(table, []);
  }

  for (const [from, to] of edges) {
    const dependents = adjacency.get(from);
    const degree = inDegree.get(to);

    if (dependents !== undefined && degree !== undefined) {
      inDegree.set(to, degree + 1);
      adjacency.set(from, [...dependents, to]);
    }
  }

  const queue = getQueue(inDegree);

  const result: Array<string> = [];

  while (queue.length > 0) {
    const q = queue.shift();
    if (q !== undefined) {
      result.push(q);

      adjacency.get(q)?.forEach((table) => {
        const degree = inDegree.get(table);
        if (typeof degree === 'number') {
          const next = degree - 1;
          inDegree.set(table, next);
          if (next === 0) {
            queue.push(table);
          }
        }
      });
    }
  }

  if (result.length === tables.length) {
    return Result.succeed(result);
  } else {
    return Result.fail(
      new CyclicDependencyError({
        tables: tables.filter((table) => !result.includes(table)),
      }),
    );
  }
};

// A self-referencing relation (users.managerId → users) adds no edge: it says
// nothing about the order between tables and would look like a cycle. Rows of
// one table are inserted in the order they were registered in the UoW.
export const insertOrderEdges: (
  relations: ReadonlyArray<TableRelations<AnyTableDef>>,
) => ReadonlyArray<Edge> = (relations) => {
  const edges: Array<Edge> = [];

  for (const relation of relations) {
    const { relations: rels, table } = relation;

    for (const value of Object.values(rels)) {
      if (table._name === value.table._name) {
        continue;
      }
      edges.push([table._name, value.table._name]);
    }
  }

  return edges;
};
