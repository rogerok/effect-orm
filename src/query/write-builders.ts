import type { Effect } from 'effect';

import type { DeleteIR, InsertIR, UpdateIR } from '#compiler/ir.js';
import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { ExpressionBuilder, Source } from '#query/expression-builder.js';
import type { InferReturning } from '#query/statements.js';
import type { Delete, Insert, Pred, Update } from '#query/typed-ast.js';
import type { AffectedRows, StatementResult } from '#query/typed-run.js';
import type { ColumnDef } from '#schema/columns.js';
import type { InferInsert, InferRow, InferUpdate } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

import { col } from '#compiler/ir-constructors.js';
import { makeExpressionBuilder } from '#query/expression-builder.js';
import { del } from '#query/statements.js';
import { insert, update as updateStmt } from '#query/statements.js';
import { run } from '#query/typed-run.js';

const prepareCodecsFactories = <T extends AnyTableDef, R>(
  table: T,
  stmt: Delete<R> | Insert<R> | Update<R>,
): Record<string, NonNullable<ColumnDef['_codec']>> => {
  const codecFactories: Record<string, NonNullable<ColumnDef['_codec']>> = {};
  if (stmt.returning !== null && stmt.returning !== '*') {
    for (const projection of stmt.returning) {
      if (projection.expr._tag === 'Column') {
        const codec = table._columns[projection.expr.name]?._codec;

        if (codec) {
          codecFactories[projection.alias ?? projection.expr.name] = codec;
        }
      }
    }
  }

  if (stmt.returning === '*') {
    for (const [k, col] of Object.entries(table._columns)) {
      if (col._codec) {
        codecFactories[k] = col._codec;
      }
    }
  }

  return codecFactories;
};

export class ExecutableInsert<T extends AnyTableDef, R> {
  constructor(
    private readonly stmt: Insert<R>,
    private readonly table: T,
  ) {}

  toIR(): Insert<R> {
    return this.stmt;
  }

  execute(): Effect.Effect<StatementResult<Insert<R>>, DriverError, Driver> {
    const codecFactories: Record<
      string,
      NonNullable<ColumnDef['_codec']>
    > = prepareCodecsFactories(this.table, this.stmt);

    return run({ stmt: this.toIR(), table: this.table, codecFactories });
  }

  returning<const Cols extends ReadonlyArray<keyof InferRow<T> & string>>(
    ...cols: Cols
  ): ExecutableInsert<T, InferReturning<T, Cols>> {
    const ir: InsertIR = {
      ...this.toIR(),
      returning: cols.map((c) => ({ expr: col(c) })),
    };

    return new ExecutableInsert<T, InferReturning<T, Cols>>(ir, this.table);
  }
}

export class InsertQueryBuilder<T extends AnyTableDef> {
  private constructor(private readonly table: T) {}

  static __make<U extends AnyTableDef>(table: U): InsertQueryBuilder<U> {
    return new InsertQueryBuilder(table);
  }

  values(
    rows: ReadonlyArray<InferInsert<T>>,
  ): ExecutableInsert<T, AffectedRows> {
    const stmt = insert(this.table, rows);

    return new ExecutableInsert<T, AffectedRows>(stmt, this.table);
  }
}

export const insertInto = <T extends AnyTableDef>(
  table: T,
): InsertQueryBuilder<T> => InsertQueryBuilder.__make(table);

export class ExecutableUpdate<T extends AnyTableDef, R> {
  constructor(
    private readonly stmt: Update<R>,
    private readonly table: T,
  ) {}

  toIR(): Update<R> {
    return this.stmt;
  }

  execute(): Effect.Effect<StatementResult<Update<R>>, DriverError, Driver> {
    const codecFactories: Record<
      string,
      NonNullable<ColumnDef['_codec']>
    > = prepareCodecsFactories(this.table, this.stmt);

    return run({
      stmt: this.toIR(),
      table: this.table,
      codecFactories,
      sources: { [this.table._name]: this.table },
    });
  }

  returning<const Cols extends ReadonlyArray<keyof InferRow<T> & string>>(
    ...cols: Cols
  ): ExecutableUpdate<T, InferReturning<T, Cols>> {
    const ir: UpdateIR = {
      ...this.toIR(),
      returning: cols.map((c) => ({ expr: col(c) })),
    };

    return new ExecutableUpdate<T, InferReturning<T, Cols>>(ir, this.table);
  }

  where(
    pred: (
      b: ExpressionBuilder<{ [K in T['_name']]: Source<T, false> }>,
    ) => Pred,
  ): ExecutableUpdate<T, R> {
    const eb = makeExpressionBuilder<{ [K in T['_name']]: Source<T, false> }>();
    const newPred = pred(eb);

    return new ExecutableUpdate<T, R>(
      {
        ...this.stmt,
        where: this.stmt.where
          ? { _tag: 'And', preds: [this.stmt.where, newPred] }
          : newPred,
      },
      this.table,
    );
  }
}

export class UpdateQueryBuilder<T extends AnyTableDef> {
  private constructor(private readonly table: T) {}

  static __make<U extends AnyTableDef>(table: U): UpdateQueryBuilder<U> {
    return new UpdateQueryBuilder<U>(table);
  }

  set(patch: InferUpdate<T>): ExecutableUpdate<T, AffectedRows> {
    const stmt = updateStmt(this.table, patch);

    return new ExecutableUpdate<T, AffectedRows>(stmt, this.table);
  }
}

export const update = <T extends AnyTableDef>(
  table: T,
): UpdateQueryBuilder<T> => UpdateQueryBuilder.__make(table);

export class ExecutableDelete<T extends AnyTableDef, R> {
  private constructor(
    private readonly table: T,
    private readonly stmt: Delete<R>,
  ) {}

  static __make<U extends AnyTableDef>(table: U, stmt: Delete<AffectedRows>) {
    return new ExecutableDelete(table, stmt);
  }

  toIR(): Delete<R> {
    return this.stmt;
  }

  where(
    pred: (
      b: ExpressionBuilder<{ [K in T['_name']]: Source<T, false> }>,
    ) => Pred,
  ): ExecutableDelete<T, R> {
    const eb = makeExpressionBuilder<{ [K in T['_name']]: Source<T, false> }>();
    const newPred = pred(eb);

    return new ExecutableDelete<T, R>(this.table, {
      ...this.stmt,
      where: this.stmt.where
        ? { _tag: 'And', preds: [this.stmt.where, newPred] }
        : newPred,
    });
  }

  returning<const Cols extends ReadonlyArray<keyof InferRow<T> & string>>(
    ...cols: Cols
  ): ExecutableDelete<T, InferReturning<T, Cols>> {
    const ir: DeleteIR = {
      ...this.toIR(),
      returning: cols.map((c) => ({ expr: col(c) })),
    };

    return new ExecutableDelete<T, InferReturning<T, Cols>>(this.table, ir);
  }

  execute(): Effect.Effect<StatementResult<Delete<R>>, DriverError, Driver> {
    const codecFactories: Record<
      string,
      NonNullable<ColumnDef['_codec']>
    > = prepareCodecsFactories(this.table, this.stmt);

    return run({
      stmt: this.toIR(),
      table: this.table,
      sources: { [this.table._name]: this.table },
      codecFactories,
    });
  }
}

export const deleteFrom = <T extends AnyTableDef>(
  table: T,
): ExecutableDelete<T, AffectedRows> =>
  ExecutableDelete.__make(table, del(table));
