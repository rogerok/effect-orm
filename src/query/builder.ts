import type { Join, OrderBy, Predicate } from '#compiler/ir.js';
import type {
  ExpressionBuilder,
  SourceMap,
} from '#query/expression-builder.js';
import type { Expr, RowFromSelection, Select } from '#query/typed-ast.js';

import { makeExpressionBuilder } from '#query/expression-builder.js';

interface BuilderState {
  readonly from: { readonly alias: string; readonly table: string };
  readonly joins: ReadonlyArray<Join>;
  readonly orderBy: ReadonlyArray<OrderBy>;
  readonly limit?: number;
  readonly offset?: number;
  readonly where?: Predicate;
}

export class SelectQueryBuilder<S extends SourceMap> {
  private constructor(private readonly state: BuilderState) {}

  static __make<S extends SourceMap>(
    state: BuilderState,
  ): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>(state);
  }

  limit(n: number): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>({ ...this.state, limit: n });
  }

  offset(n: number): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>({ ...this.state, offset: n });
  }

  where(pred: (b: ExpressionBuilder<S>) => Predicate): SelectQueryBuilder<S> {
    const eb = makeExpressionBuilder<S>();
    const newPred = pred(eb);
    return new SelectQueryBuilder<S>({
      ...this.state,
      where: this.state.where
        ? { _tag: 'And', preds: [this.state.where, newPred] }
        : newPred,
    });
  }

  orderBy(
    fn: (b: ExpressionBuilder<S>) => ReadonlyArray<OrderBy>,
  ): SelectQueryBuilder<S> {
    const eb = makeExpressionBuilder<S>();
    return new SelectQueryBuilder<S>({
      ...this.state,
      orderBy: [...this.state.orderBy, ...fn(eb)],
    });
  }

  select<Sel extends Record<string, Expr<unknown>>>(
    selection: (b: ExpressionBuilder<S>) => Sel,
  ): Select<RowFromSelection<Sel>> {
    const eb = makeExpressionBuilder<S>();
    const sel = selection(eb);
    const columns = Object.entries(sel).map(([alias, expr]) => ({
      expr,
      alias,
    }));

    return { ...this.state, columns, _tag: 'Select' };
  }
}

export const selectFrom = <T extends SourceMap[string], A extends string>(
  table: T,
  alias: A,
): SelectQueryBuilder<{ [K in A]: T }> =>
  SelectQueryBuilder.__make({
    from: { table: table._name, alias },
    joins: [],
    orderBy: [],
  });
