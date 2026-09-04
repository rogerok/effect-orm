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

const printLiteral = Match.type<unknown>().pipe(
  Match.whenOr(Match.number, Match.bigint, (n) => {
    if (typeof n === 'number' && !Number.isFinite(n)) {
      throw new TypeError('value must be a finite number');
    }
    return n.toString();
  }),
  Match.when(Match.string, (s) => `'${s.replaceAll(`'`, `''`)}'`),
  Match.when(Match.boolean, (b) => b.toString().toUpperCase()),
  Match.when(Match.null, () => 'NULL'),
  Match.orElse((unhandled) => {
    throw new TypeError(`Unsupported literal type: ${typeof unhandled}`);
  }),
);

type BinopTag = 'Eq' | 'Gt' | 'Gte' | 'Like' | 'Lt' | 'Lte' | 'Neq';

const BINOP: Record<BinopTag, string> = {
  Eq: '=',
  Neq: '<>',
  Gt: '>',
  Gte: '>=',
  Lt: '<',
  Lte: '<=',
  Like: 'LIKE',
} as const;

const printExpr = (expr: Expr) =>
  Match.value(expr).pipe(
    Match.tag('Literal', ({ value }) => printLiteral(value)),
    Match.tag('Column', ({ name, table }) => {
      if (table) {
        return `${table}.${name}`;
      }
      return name;
    }),
    Match.exhaustive,
  );

const joinPredicates = (
  preds: ReadonlyArray<Predicate>,
  separator: string,
  empty: string,
) =>
  preds.length === 0
    ? empty
    : preds.map((p) => `(${printPredicate(p)})`).join(separator);

const printPredicate = (pred: Predicate): string =>
  Match.value(pred).pipe(
    Match.tag('And', 'Or', ({ preds, _tag }) =>
      _tag === 'And'
        ? joinPredicates(preds, ' AND ', 'TRUE')
        : joinPredicates(preds, ' OR ', 'FALSE'),
    ),
    Match.tag(
      'Eq',
      'Neq',
      'Gt',
      'Gte',
      'Lt',
      'Lte',
      'Like',
      ({ _tag, left, right }) =>
        `${printExpr(left)} ${BINOP[_tag]} ${printExpr(right)}`,
    ),
    Match.tag('In', ({ left, values }) =>
      values.length === 0
        ? 'FALSE'
        : `${printExpr(left)} IN (${values.map((v) => printExpr(v)).join(', ')})`,
    ),
    Match.tag('Not', ({ pred: inner }) => `NOT (${printPredicate(inner)})`),
    Match.tag(
      'Between',
      ({ expr, min, max }) =>
        `${printExpr(expr)} BETWEEN ${printExpr(min)} AND ${printExpr(max)}`,
    ),
    Match.tag(
      'IsNull',
      ({ expr, negate }) =>
        `${printExpr(expr)} IS ${negate ? 'NOT NULL' : 'NULL'}`,
    ),
    Match.tag('Boolean', ({ value }) => (value ? 'TRUE' : 'FALSE')),
    Match.exhaustive,
  );

const printProjection = (projection: Projection): string => {
  if (projection === '*') {
    return '*';
  }

  return projection
    .map((p) =>
      p.alias ? `${printExpr(p.expr)} AS ${p.alias}` : printExpr(p.expr),
    )
    .join(', ');
};

const printSelect = (ir: SelectIR): string => {
  const parts: string[] = [`SELECT ${printProjection(ir.columns)}`];

  parts.push(
    `FROM ${ir.from.table}${ir.from.alias ? ` AS ${ir.from.alias}` : ''}`,
  );

  for (const j of ir.joins) {
    const kind = j.kind === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    const alias = j.alias ? ` AS ${j.alias}` : '';

    parts.push(`${kind} ${j.table}${alias} ON ${printPredicate(j.on)}`);
  }

  if (ir.where) {
    parts.push(`WHERE ${printPredicate(ir.where)}`);
  }

  if (ir.orderBy.length > 0) {
    const ob = ir.orderBy
      .map((o) => `${printExpr(o.expr)} ${o.dir.toUpperCase()}`)
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

const printInsert = (ir: InsertIR): string => {
  if (ir.rows.length === 0 || ir.rows[0] === undefined) {
    throw new Error('INSERT requires at least one row');
  }

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

      const exprs = cols
        .map((c) => {
          const expr = row[c];

          if (expr === undefined) {
            throw new Error('Expression should be defined');
          }

          return printExpr(expr);
        })
        .join(', ');

      return `(${exprs})`;
    })
    .join(', ');

  let sql = `INSERT INTO ${ir.into} (${cols.join(', ')}) VALUES ${valueSql}`;

  if (ir.returning) {
    sql += ` RETURNING ${printProjection(ir.returning)}`;
  }

  return sql;
};

const printDelete = (ir: DeleteIR): string => {
  let sql = `DELETE FROM ${ir.from}`;

  if (ir.where) {
    sql += ` WHERE ${printPredicate(ir.where)}`;
  }

  if (ir.returning) {
    sql += ` RETURNING ${printProjection(ir.returning)}`;
  }

  return sql;
};

const printUpdate = (ir: UpdateIR): string => {
  const sets = Object.entries(ir.set)
    .map(([k, v]) => `${k} = ${printExpr(v)}`)
    .join(', ');

  let sql = `UPDATE ${ir.table} SET ${sets}`;

  if (ir.where) {
    sql += ` WHERE ${printPredicate(ir.where)}`;
  }

  if (ir.returning) {
    sql += ` RETURNING ${printProjection(ir.returning)}`;
  }

  return sql;
};

export const prettyPrint = (ir: IR): string =>
  Match.value(ir).pipe(
    Match.tagsExhaustive({
      Select: (select) => printSelect(select),
      Insert: (insert) => printInsert(insert),
      Delete: (del) => printDelete(del),
      Update: (update) => printUpdate(update),
    }),
  );
