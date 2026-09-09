import type { DeleteIR, InsertIR, UpdateIR } from '#compiler/ir.js';
import type {
  Delete,
  Expr,
  Insert,
  Pred,
  Select,
  Update,
} from '#query/typed-ast.js';
import type { InferInsert, InferRow, InferUpdate } from '#schema/infer.js';
import type { AnyTableDef } from '#schema/table.js';

type SelectOptions = {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: ReadonlyArray<{
    readonly dir: 'asc' | 'desc';
    readonly expr: Expr<unknown>;
  }>;
  readonly where?: Pred;
};

export const select = <
  T extends AnyTableDef,
  Cols extends ReadonlyArray<keyof InferRow<T> & string>,
>(
  table: T,
  columns: Cols,
  options: SelectOptions = {},
): Select<Pick<InferRow<T>, Cols[number]>> =>
  ({
    _tag: 'Select',
    from: { table: table._name },
    columns: columns.map((name) => ({ expr: { _tag: 'Column', name } })),
    joins: [],
    where: options.where,
    orderBy: options.orderBy ?? [],
    limit: options.limit,
    offset: options.offset,
  }) as Select<Pick<InferRow<T>, Cols[number]>>;

export const selectAll = <T extends AnyTableDef>(
  table: T,
  options: SelectOptions = {},
): Select<InferRow<T>> =>
  ({
    _tag: 'Select',
    from: { table: table._name },
    columns: '*',
    joins: [],
    where: options.where,
    orderBy: options.orderBy ?? [],
    limit: options.limit,
    offset: options.offset,
  }) as Select<InferRow<T>>;

export type ReturningOption<T extends AnyTableDef> =
  ReadonlyArray<keyof InferRow<T> & string> | '*';

type InferReturning<
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined,
> = R extends '*'
  ? InferRow<T>
  : R extends ReadonlyArray<infer K>
    ? K extends keyof InferRow<T>
      ? Pick<InferRow<T>, K>
      : never
    : { readonly affectedRows: number };

export const insert = <
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined = undefined,
>(
  table: T,
  rows: ReadonlyArray<InferInsert<T>>,
  options: { returning?: R } = {},
): Insert<InferReturning<T, R>> => {
  const ir: InsertIR = {
    _tag: 'Insert',
    into: table._name,
    rows: rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, { _tag: 'Literal', value: v }]),
      ),
    ),
    returning:
      options.returning === '*'
        ? '*'
        : options.returning !== undefined
          ? (options.returning as ReadonlyArray<string>).map((name) => ({
              expr: { _tag: 'Column', name },
            }))
          : null,
  };

  return ir as Insert<InferReturning<T, R>>;
};

interface DelOptions<
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined,
> {
  readonly returning?: R;
  readonly where?: Pred;
}

export const del = <
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined = undefined,
>(
  table: T,
  options: DelOptions<T, R> = {},
): Delete<InferReturning<T, R>> => {
  const ir: DeleteIR = {
    _tag: 'Delete',
    from: table._name,
    returning:
      options.returning === '*'
        ? '*'
        : options.returning !== undefined
          ? (options.returning as ReadonlyArray<string>).map((name) => ({
              expr: { _tag: 'Column', name },
            }))
          : null,
    ...(options.where === undefined ? {} : { where: options.where }),
  };
  return ir as Delete<InferReturning<T, R>>;
};

interface UpdateOptions<
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined,
> {
  readonly returning?: R;
  readonly where?: Pred;
}

export const update = <
  T extends AnyTableDef,
  R extends ReturningOption<T> | undefined = undefined,
>(
  table: T,
  set: InferUpdate<T>,
  options: UpdateOptions<T, R> = {},
): Update<InferReturning<T, R>> => {
  const ir: UpdateIR = {
    _tag: 'Update',
    table: table._name,
    set: Object.fromEntries(
      Object.entries(set).map(([k, v]) => [k, { _tag: 'Literal', value: v }]),
    ),
    returning:
      options.returning === '*'
        ? '*'
        : options.returning !== undefined
          ? (options.returning as ReadonlyArray<string>).map((name) => ({
              expr: { _tag: 'Column', name },
            }))
          : null,
    ...(options.where === undefined ? {} : { where: options.where }),
  };

  return ir as Update<InferReturning<T, R>>;
};
