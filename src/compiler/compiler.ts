import { Match } from 'effect';

import type {
  DeleteIR,
  Expr,
  InsertIR,
  IR,
  Predicate,
  Projection,
  SelectIR,
  UpdateIR,
} from '#compiler/ir.js';
import type { Dialect } from '#dialect.js';

export type Compiled = {
  readonly params: ReadonlyArray<unknown>;
  readonly sql: string;
};

type Ctx = { readonly dialect: Dialect; readonly params: unknown[] };

type BinopTag = 'Eq' | 'Gt' | 'Gte' | 'Like' | 'Lt' | 'Lte' | 'Neq';

const BINOP: Record<BinopTag, string> = {
  Eq: '=',
  Neq: '<>',
  Gt: '>',
  Gte: '>=',
  Lt: '<',
  Lte: '<=',
  Like: 'LIKE',
};

const param = (ctx: Ctx, value: unknown): string => {
  ctx.params.push(value);

  return ctx.dialect.placeholder(ctx.params.length);
};

const compileExpr = (expr: Expr, ctx: Ctx): string =>
  Match.value(expr).pipe(
    Match.tag('Column', ({ name, table }) => {
      const q = ctx.dialect.quoteIdentifier;

      return table ? `${q(table)}.${q(name)}` : q(name);
    }),
    Match.tag('Literal', ({ value }) => param(ctx, value)),
    Match.exhaustive,
  );

const compileBinop = (
  pred: Extract<Predicate, { readonly _tag: BinopTag }>,
  ctx: Ctx,
): string =>
  `${compileExpr(pred.left, ctx)} ${BINOP[pred._tag]} ${compileExpr(pred.right, ctx)}`;

const joinPredicates = (
  preds: ReadonlyArray<Predicate>,
  ctx: Ctx,
  separator: string,
  empty: string,
): string =>
  preds.length === 0
    ? empty
    : preds.map((child) => `(${compilePredicate(child, ctx)})`).join(separator);

const compilePredicate = (pred: Predicate, ctx: Ctx): string =>
  Match.value(pred).pipe(
    Match.tag('Eq', 'Neq', 'Gt', 'Gte', 'Lt', 'Lte', 'Like', (binop) =>
      compileBinop(binop, ctx),
    ),

    Match.tag('In', ({ left, values }) =>
      values.length === 0
        ? 'FALSE' // IN () is invalid in SQL
        : `${compileExpr(left, ctx)} IN (${values.map((v) => compileExpr(v, ctx)).join(', ')})`,
    ),

    Match.tag(
      'IsNull',
      ({ expr, negate }) =>
        `${compileExpr(expr, ctx)} IS ${negate ? 'NOT NULL' : 'NULL'}`,
    ),

    Match.tag('And', 'Or', ({ _tag, preds }) =>
      _tag === 'And'
        ? joinPredicates(preds, ctx, ' AND ', 'TRUE')
        : joinPredicates(preds, ctx, ' OR ', 'FALSE'),
    ),
    Match.tag(
      'Not',
      ({ pred: inner }) => `NOT (${compilePredicate(inner, ctx)})`,
    ),
    Match.tag(
      'Between',
      ({ expr, min, max }) =>
        `${compileExpr(expr, ctx)} BETWEEN ${compileExpr(min, ctx)} AND ${compileExpr(max, ctx)}`,
    ),
    Match.exhaustive,
  );

const compileProjection = (proj: Projection, ctx: Ctx) => {
  if (proj === '*') {
    return '*';
  }

  const q = ctx.dialect.quoteIdentifier;

  return proj
    .map((c) =>
      c.alias
        ? `${compileExpr(c.expr, ctx)} AS ${q(c.alias)}`
        : compileExpr(c.expr, ctx),
    )
    .join(', ');
};

const compileSelect = (ir: SelectIR, ctx: Ctx): string => {
  const q = ctx.dialect.quoteIdentifier;

  const parts: string[] = [`SELECT ${compileProjection(ir.columns, ctx)}`];

  parts.push(
    `FROM ${q(ir.from.table)}${ir.from.alias ? ` AS ${q(ir.from.alias)}` : ''}`,
  );

  for (const j of ir.joins) {
    const kind = j.kind === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    const alias = j.alias ? ` AS ${q(j.alias)}` : '';

    parts.push(
      `${kind} ${q(j.table)}${alias} ON ${compilePredicate(j.on, ctx)}`,
    );
  }

  if (ir.where) {
    parts.push(`WHERE ${compilePredicate(ir.where, ctx)}`);
  }

  if (ir.orderBy.length > 0) {
    const ob = ir.orderBy
      .map((o) => `${compileExpr(o.expr, ctx)} ${o.dir.toUpperCase()}`)
      .join(', ');

    parts.push(`ORDER BY ${ob}`);
  }

  if (ir.limit !== undefined) {
    parts.push(`LIMIT ${ir.limit}`);
  }

  if (ir.offset !== undefined) {
    parts.push(`OFFSET ${ir.offset}`);
  }

  return parts.join(' ');
};

const compileUpdate = (ir: UpdateIR, ctx: Ctx): string => {
  const q = ctx.dialect.quoteIdentifier;
  const sets = Object.entries(ir.set)
    .map(([k, v]) => `${q(k)} = ${compileExpr(v, ctx)}`)
    .join(', ');

  let sql = `UPDATE ${q(ir.table)} SET ${sets}`;

  if (ir.where) {
    sql += ` WHERE ${compilePredicate(ir.where, ctx)}`;
  }

  if (ir.returning) {
    sql += ` RETURNING ${compileProjection(ir.returning, ctx)}`;
  }

  return sql;
};

const compileDelete = (ir: DeleteIR, ctx: Ctx): string => {
  const q = ctx.dialect.quoteIdentifier;
  let sql = `DELETE FROM ${q(ir.from)}`;

  if (ir.where) {
    sql += ` WHERE ${compilePredicate(ir.where, ctx)}`;
  }

  if (ir.returning) {
    sql += ` RETURNING ${compileProjection(ir.returning, ctx)}`;
  }

  return sql;
};

const compileInsert = (ir: InsertIR, ctx: Ctx): string => {
  if (ir.rows.length === 0 || ir.rows[0] === undefined) {
    throw new Error('INSERT requires at least one row');
  }

  const q = ctx.dialect.quoteIdentifier;
  const cols = Object.keys(ir.rows[0]);

  if (cols.length === 0) {
    throw new Error('INSERT requires at least one column');
  }

  const valueSql = ir.rows
    .map((row, rowIdx) => {
      const rowCols = Object.keys(row);

      const hasSameCols =
        rowCols.length === cols.length &&
        cols.every((c) => Object.hasOwn(row, c));

      if (!hasSameCols) {
        throw new Error(
          `INSERT row ${rowIdx} has different columns: ` +
            `expected [${cols.join(', ')}], ` +
            `received [${rowCols.join(', ')}]`,
        );
      }

      return `(${cols
        .map((c) => {
          const expr = row[c];
          if (expr === undefined) {
            throw new Error('Expression should be defined');
          }

          return compileExpr(expr, ctx);
        })
        .join(', ')})`;
    })
    .join(', ');

  let sql = `INSERT INTO ${q(ir.into)} (${cols.map(q).join(', ')}) VALUES ${valueSql}`;

  if (ir.returning) {
    sql += ` RETURNING ${compileProjection(ir.returning, ctx)}`;
  }
  return sql;
};

export const compile = (ir: IR, dialect: Dialect): Compiled => {
  const ctx: Ctx = { dialect, params: [] };
  const sql = Match.value(ir).pipe(
    Match.tagsExhaustive({
      Select: (select) => compileSelect(select, ctx),
      Insert: (insert) => compileInsert(insert, ctx),
      Update: (update) => compileUpdate(update, ctx),
      Delete: (del) => compileDelete(del, ctx),
    }),
  );

  return { sql, params: ctx.params };
};
