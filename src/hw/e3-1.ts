import type { Effect } from 'effect';

import type { SelectIR } from '#compiler/ir.js';
import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { SourceMap } from '#query/expression-builder.js';
import type { Expr, Pred } from '#query/index.js';
import type { RowFromSelection } from '#query/typed-ast.js';

import { makeExpressionBuilder } from '#query/expression-builder.js';
import { integer, text } from '#schema/columns.js';
import { table } from '#schema/table.js';

declare const selectFrom: <T extends SourceMap[string], A extends string>(
  table: T,
  alias: A,
) => SelectQueryBuilder<{ [K in A]: T }>;

interface SelectQueryBuilder<S extends SourceMap> {
  select: <R>() => ExecutableQuery<R>;
  where: () => SelectQueryBuilder<S>;
}

interface ExecutableQuery<R> {
  execute: () => Effect.Effect<ReadonlyArray<R>, DriverError, Driver>;
  toIR: () => SelectIR;
}
const users = table('users', {
  id: integer(),
  name: text(),
});

const start = selectFrom(users, 'u');

const directQuery = start.select<{ id: number }>().execute();
const filteredQuery = start.where().select<{ id: number }>().execute();
// @ts-expect-error
start.select().where();
// @ts-expect-error
start.where().execute();

type SourcesOfB<B> = B extends SelectQueryBuilder<infer S> ? S : never;
type Sources = SourcesOfB<typeof start>;
const validAlias: keyof Sources = 'u';

const validColumn: keyof Sources['u']['_columns'] = 'id';
//@ts-expect-error
type neg1 = Sources['x'];
//@ts-expect-error
type neg2 = Sources['u']['_columns']['missing'];

const expressionBuilder = makeExpressionBuilder<Sources>();

const ageLiteral: Expr<number> = expressionBuilder.lit(18);
const nameLiteral: Expr<string> = expressionBuilder.lit('John');

const a: Expr<number> = expressionBuilder.col('u', 'id');
const b: Expr<string> = expressionBuilder.col('u', 'name');
const agePredicate: Pred = expressionBuilder.eq(a, ageLiteral);
const namePredicate: Pred = expressionBuilder.eq(b, nameLiteral);
const combinePredicate: Pred = expressionBuilder.and(
  agePredicate,
  namePredicate,
);
// @ts-expect-error — number expression нельзя сравнивать со string expression
const incompatiblePredicate = expressionBuilder.eq(a, b);
//@ts-expect-error
const c = expressionBuilder.col('x', 'id');
//@ts-expect-error
const d = expressionBuilder.col('u', 'missing');

type SelectedRow = RowFromSelection<{
  active: Expr<boolean>;
  nickname: Expr<string | null>;
}>;
