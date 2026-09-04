import type { SelectIR } from '#compiler/ir.js';

import { compile } from '#compiler/compiler.js';
import {
  and,
  bool,
  col,
  eq,
  gt,
  lit,
  not,
  or,
} from '#compiler/ir-constructors.js';
import { optimizePredicate, optimizeSelect } from '#compiler/optimize.js';
import { PgDialect } from '#dialect.js';

const ir: SelectIR = {
  _tag: 'Select',
  from: { table: 'users' },
  columns: [{ expr: col('id') }, { expr: col('name') }],
  joins: [],
  where: gt(col('age'), lit(18)),
  orderBy: [{ expr: col('name'), dir: 'asc' }],
  limit: 10,
};

describe('optimize predicate', () => {
  it('removes double Not', () => {
    const inner = gt(col('age'), lit(18));

    const input = not(not(inner));

    const result = optimizePredicate(input);

    expect(result).toEqual(inner);
  });

  it('unwraps And with one predicate', () => {
    const inner = gt(col('age'), lit(18));

    const result = optimizePredicate(and(inner));

    expect(result).toEqual(inner);
  });

  it('keeps And with multiple predicates', () => {
    const first = gt(col('age'), lit(18));
    const second = gt(col('score'), lit(100));
    const input = and(first, second);
    const result = optimizePredicate(input);

    expect(result).toEqual(input);
  });

  it('empty And should return bool predicate', () => {
    expect(optimizePredicate(and())).toEqual(bool(true));
  });

  it('recursion test', () => {
    const third = gt(col('age'), lit(30));
    const first = gt(col('age'), lit(18));
    const second = gt(col('score'), lit(100));
    const input = and(and(), not(not(first)), second, third);

    expect(optimizePredicate(input)).toEqual({
      _tag: 'And',
      preds: [first, second, third],
    });
  });

  it('eq test 1 returns bool(true) pred', () => {
    const input = eq(lit(1), lit(1));

    expect(optimizePredicate(input)).toEqual(bool(true));
  });

  it('eq test 2 returns bool(false) pred', () => {
    const input = eq(lit(1), lit(2));

    expect(optimizePredicate(input)).toEqual(bool(false));
  });

  it('or returns equal pred', () => {
    const pred = eq(lit(1), col('age'));
    const input = or(pred, pred);

    expect(optimizePredicate(input)).toEqual(pred);
  });

  it('empty or returns bool(false)', () => {
    expect(optimizePredicate(or())).toEqual(bool(false));
  });

  it('or returns predicate', () => {
    const pred = eq(lit(1), col('age'));

    expect(optimizePredicate(or(bool(false), pred))).toEqual(pred);
  });

  it('or returns bool(true)', () => {
    const pred = eq(lit(1), col('age'));

    expect(optimizePredicate(or(bool(true), pred))).toEqual(bool(true));
  });

  it('optimize select does not have where property', () => {
    expect(optimizeSelect({ ...ir, where: and() })).not.toHaveProperty('where');
  });

  it('optimize select keep bool(false) where property', () => {
    expect(optimizeSelect({ ...ir, where: bool(false) }).where).toEqual(
      bool(false),
    );
  });

  it('optimize select with sql parsing with bool(true)', () => {
    const optimized = optimizeSelect({ ...ir, where: eq(lit(1), lit(1)) });
    const { sql, params } = compile(optimized, PgDialect);

    expect(params).toHaveLength(0);
    expect(sql).not.toContain('WHERE');
  });

  it('optimize select with sql parsing with bool(false)', () => {
    const optimized = optimizeSelect({ ...ir, where: eq(lit(1), lit(2)) });
    const { sql, params } = compile(optimized, PgDialect);

    expect(params).toHaveLength(0);
    expect(sql).toContain('WHERE FALSE');
  });

  it('optimize select does not mutate initial ast', () => {
    const input = {
      ...ir,
      where: and(and(), not(not(eq(lit(1), lit(2)))), eq(lit(1), lit(2))),
    };

    const snapshot = structuredClone(input);

    optimizeSelect(input);

    expect(input).toEqual(snapshot);
  });
});
