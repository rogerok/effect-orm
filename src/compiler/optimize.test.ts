import type { SelectIR } from '#compiler/ir.js';

import { compile } from '#compiler/compiler.js';
import * as IR from '#compiler/ir-constructors.js';
import { optimizePredicate, optimizeSelect } from '#compiler/optimize.js';
import { PgDialect } from '#dialect.js';

const ir: SelectIR = {
  _tag: 'Select',
  from: { table: 'users' },
  columns: [{ expr: IR.col('id') }, { expr: IR.col('name') }],
  joins: [],
  where: IR.gt(IR.col('age'), IR.lit(18)),
  orderBy: [{ expr: IR.col('name'), dir: 'asc' }],
  limit: 10,
};

describe('optimize predicate', () => {
  it('removes double Not', () => {
    const inner = IR.gt(IR.col('age'), IR.lit(18));

    const input = IR.not(IR.not(inner));

    const result = optimizePredicate(input);

    expect(result).toEqual(inner);
  });

  it('unwraps And with one predicate', () => {
    const inner = IR.gt(IR.col('age'), IR.lit(18));

    const result = optimizePredicate(IR.and(inner));

    expect(result).toEqual(inner);
  });

  it('keeps And with multiple predicates', () => {
    const first = IR.gt(IR.col('age'), IR.lit(18));
    const second = IR.gt(IR.col('score'), IR.lit(100));
    const input = IR.and(first, second);
    const result = optimizePredicate(input);

    expect(result).toEqual(input);
  });

  it('empty And should return bool predicate', () => {
    expect(optimizePredicate(IR.and())).toEqual(IR.bool(true));
  });

  it('recursion test', () => {
    const third = IR.gt(IR.col('age'), IR.lit(30));
    const first = IR.gt(IR.col('age'), IR.lit(18));
    const second = IR.gt(IR.col('score'), IR.lit(100));
    const input = IR.and(IR.and(), IR.not(IR.not(first)), second, third);

    expect(optimizePredicate(input)).toEqual({
      _tag: 'And',
      preds: [first, second, third],
    });
  });

  it('eq test 1 returns bool(true) pred', () => {
    const input = IR.eq(IR.lit(1), IR.lit(1));

    expect(optimizePredicate(input)).toEqual(IR.bool(true));
  });

  it('eq test 2 returns bool(false) pred', () => {
    const input = IR.eq(IR.lit(1), IR.lit(2));

    expect(optimizePredicate(input)).toEqual(IR.bool(false));
  });

  it('or returns equal pred', () => {
    const pred = IR.eq(IR.lit(1), IR.col('age'));
    const input = IR.or(pred, pred);

    expect(optimizePredicate(input)).toEqual(pred);
  });

  it('empty or returns bool(false)', () => {
    expect(optimizePredicate(IR.or())).toEqual(IR.bool(false));
  });

  it('or returns predicate', () => {
    const pred = IR.eq(IR.lit(1), IR.col('age'));

    expect(optimizePredicate(IR.or(IR.bool(false), pred))).toEqual(pred);
  });

  it('or returns bool(true)', () => {
    const pred = IR.eq(IR.lit(1), IR.col('age'));

    expect(optimizePredicate(IR.or(IR.bool(true), pred))).toEqual(
      IR.bool(true),
    );
  });

  it('optimize select does not have where property', () => {
    expect(optimizeSelect({ ...ir, where: IR.and() })).not.toHaveProperty(
      'where',
    );
  });

  it('optimize select keep bool(false) where property', () => {
    expect(optimizeSelect({ ...ir, where: IR.bool(false) }).where).toEqual(
      IR.bool(false),
    );
  });

  it('optimize select with sql parsing with bool(true)', () => {
    const optimized = optimizeSelect({
      ...ir,
      where: IR.eq(IR.lit(1), IR.lit(1)),
    });
    const { sql, params } = compile(optimized, PgDialect);

    expect(params).toHaveLength(0);
    expect(sql).not.toContain('WHERE');
  });

  it('optimize select with sql parsing with bool(false)', () => {
    const optimized = optimizeSelect({
      ...ir,
      where: IR.eq(IR.lit(1), IR.lit(2)),
    });
    const { sql, params } = compile(optimized, PgDialect);

    expect(params).toHaveLength(0);
    expect(sql).toContain('WHERE FALSE');
  });

  it('optimize select does not mutate initial ast', () => {
    const input = {
      ...ir,
      where: IR.and(
        IR.and(),
        IR.not(IR.not(IR.eq(IR.lit(1), IR.lit(2)))),
        IR.eq(IR.lit(1), IR.lit(2)),
      ),
    };

    const snapshot = structuredClone(input);

    optimizeSelect(input);

    expect(input).toEqual(snapshot);
  });
});
