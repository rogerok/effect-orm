import { and, col, eq, gt, lit, not } from '#compiler/ir-constructors.js';
import { optimizePredicate } from '#compiler/optimize-predicate.js';

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

  it('empty And should return null', () => {
    expect(optimizePredicate(and())).toBe(null);
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

  it('eq test 1', () => {
    const input = eq(lit(1), lit(1));

    expect(optimizePredicate(input)).toBe(null);
  });
});
