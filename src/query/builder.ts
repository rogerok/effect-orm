import type { Option } from 'effect';

import { Array, Effect } from 'effect';

import type {
  Join as JoinIR,
  OrderBy as OrderByIR,
  Predicate as PredIR,
  SelectIR,
} from '#compiler/ir.js';
import type { Driver } from '#drivers/driver.js';
import type {
  ExpressionBuilder,
  Source,
  SourceMap,
} from '#query/expression-builder.js';
import type { Expr, Pred, RowFromSelection, Select } from '#query/typed-ast.js';
import type { InferRow } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

import {
  type DriverError,
  NotFoundError,
  TooManyError,
} from '#errors/errors.js';
import { makeExpressionBuilder } from '#query/expression-builder.js';
import { run, runWithSql } from '#query/typed-run.js';

type ExecutableState = { readonly columns: SelectIR['columns'] } & BuilderState;

/*
Использую run, runWithsql т.к. данный функционал уже заменяет вызов драйвера
      const driver = yield* Driver;
      const { sql, params } = compile(ir, driver.dialect);
      const raw = yield* driver.executeRaw(sql, params);

      Также использую Option на тот случай, если элемент массива === undefined
 */

export class ExecutableQuery<R> {
  constructor(private readonly state: ExecutableState) {}

  toIR(): Select<R> {
    return {
      _tag: 'Select',
      ...this.state,
    };
  }

  execute(): Effect.Effect<ReadonlyArray<R>, DriverError, Driver> {
    const ir = this.toIR();

    return run(ir);
  }

  executeOne(): Effect.Effect<Option.Option<R>, DriverError, Driver> {
    const ir = this.toIR();

    return run(ir).pipe(Effect.map(Array.head));
  }

  executeOneOrThrow(): Effect.Effect<
    R,
    DriverError | NotFoundError | TooManyError,
    Driver
  > {
    const ir = this.toIR();

    return Effect.gen(function* () {
      const { sql, result } = yield* runWithSql(ir);

      if (result[0] === undefined) {
        return yield* new NotFoundError({ sql });
      }

      if (result.length > 1) {
        return yield* new TooManyError({ sql, count: result.length });
      }

      return result[0];
    });
  }
}

interface BuilderState {
  readonly from: { readonly alias: string; readonly table: string };
  readonly joins: ReadonlyArray<JoinIR>;
  readonly orderBy: ReadonlyArray<OrderByIR>;
  readonly limit?: number;
  readonly offset?: number;
  readonly where?: PredIR;
}

type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;
type IsSingleSource<S> = IsUnion<keyof S> extends true ? false : true;

export class SelectQueryBuilder<S extends SourceMap> {
  private constructor(private readonly state: BuilderState) {}

  static __make<S extends SourceMap>(
    state: BuilderState,
  ): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>(state);
  }

  /**
   * Добавляет INNER JOIN и регистрирует `alias` как новый источник SourceMap.
   *
   * Alias обязан быть уникален в пределах запроса. Повторный alias компилятором
   * не отклоняется: пересечение `{ [K in A]: T } & S` объединяет колонки обеих
   * таблиц под одним ключом, поэтому `col` начинает принимать колонки, которых
   * у источника под этим alias нет.
   *
   * Такой запрос отклоняется во время исполнения, и текст ошибки зависит от
   * базы данных. PostgreSQL отвергает сам FROM: `table name "u" specified more
   * than once`. SQLite отвергает первую ссылку на колонку через занятый alias:
   * `ambiguous column name: u.id`.
   */
  innerJoin<T extends AnyTableDef, A extends string>(
    table: T,
    alias: A,
    on: (b: ExpressionBuilder<{ [K in A]: Source<T, false> } & S>) => Pred,
  ): SelectQueryBuilder<{ [K in A]: Source<T, false> } & S> {
    const eb = makeExpressionBuilder<{ [K in A]: Source<T, false> } & S>();
    const onPred = on(eb);

    return new SelectQueryBuilder<{ [K in A]: Source<T, false> } & S>({
      ...this.state,
      joins: [
        ...this.state.joins,
        { kind: 'inner', table: table._name, alias, on: onPred },
      ],
    });
  }

  leftJoin<T extends AnyTableDef, A extends string>(
    table: T,
    alias: A,
    on: (b: ExpressionBuilder<{ [K in A]: Source<T, false> } & S>) => Pred,
  ): SelectQueryBuilder<{ [K in A]: Source<T, true> } & S> {
    const eb = makeExpressionBuilder<{ [K in A]: Source<T, false> } & S>();
    const onPred = on(eb);

    return new SelectQueryBuilder<{ [K in A]: Source<T, true> } & S>({
      ...this.state,
      joins: [
        ...this.state.joins,
        { kind: 'left', table: table._name, alias, on: onPred },
      ],
    });
  }

  limit(n: number): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>({ ...this.state, limit: n });
  }

  offset(n: number): SelectQueryBuilder<S> {
    return new SelectQueryBuilder<S>({ ...this.state, offset: n });
  }

  where(pred: (b: ExpressionBuilder<S>) => Pred): SelectQueryBuilder<S> {
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
    fn: (b: ExpressionBuilder<S>) => ReadonlyArray<{
      readonly dir: 'asc' | 'desc';
      readonly expr: Expr<unknown>;
    }>,
  ): SelectQueryBuilder<S> {
    const eb = makeExpressionBuilder<S>();
    return new SelectQueryBuilder<S>({
      ...this.state,
      orderBy: [...this.state.orderBy, ...fn(eb)],
    });
  }

  select<Sel extends Record<string, Expr<unknown>>>(
    selection: (b: ExpressionBuilder<S>) => Sel,
  ): ExecutableQuery<RowFromSelection<Sel>> {
    const eb = makeExpressionBuilder<S>();
    const sel = selection(eb);
    const columns = Object.entries(sel).map(([alias, expr]) => ({
      expr,
      alias,
    }));

    return new ExecutableQuery({ ...this.state, columns });
  }

  selectAll(
    // использую  type level проверку, вместо runtime проверки
    this: IsSingleSource<S> extends true ? SelectQueryBuilder<S> : never,
  ): ExecutableQuery<InferRow<S[keyof S]['table']>> {
    return new ExecutableQuery({ ...this.state, columns: '*' });
  }
}

export const selectFrom = <T extends AnyTableDef, A extends string>(
  table: T,
  alias: A,
): SelectQueryBuilder<{ [K in A]: Source<T, false> }> =>
  SelectQueryBuilder.__make({
    from: { table: table._name, alias },
    joins: [],
    orderBy: [],
  });
