import type { Effect } from 'effect';

import type { Driver } from '#drivers/driver.js';
import type { DriverError } from '#errors/errors.js';
import type { Insert } from '#query/typed-ast.js';
import type { AffectedRows, StatementResult } from '#query/typed-run.js';
import type { InferInsert } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

import { insert } from '#query/statements.js';
import { run } from '#query/typed-run.js';

export class ExecutableInsert<R> {
  constructor(private readonly stmt: Insert<R>) {}

  toIR(): Insert<R> {
    return this.stmt;
  }

  execute(): Effect.Effect<StatementResult<Insert<R>>, DriverError, Driver> {
    return run(this.toIR());
  }
}

export class InsertQueryBuilder<T extends AnyTableDef> {
  private constructor(private readonly table: T) {}

  static __make<U extends AnyTableDef>(table: U): InsertQueryBuilder<U> {
    return new InsertQueryBuilder(table);
  }

  values(rows: ReadonlyArray<InferInsert<T>>): ExecutableInsert<AffectedRows> {
    const stmt = insert(this.table, rows);

    return new ExecutableInsert(stmt);
  }
}

export const insertInto = <T extends AnyTableDef>(
  table: T,
): InsertQueryBuilder<T> => InsertQueryBuilder.__make(table);
