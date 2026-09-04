import type { Predicate, SelectIR } from '#compiler/ir.js';

import { and, bool, or } from '#compiler/ir-constructors.js';

export const optimizePredicate = (input: Predicate): Predicate => {
  if (input._tag === 'Not' && input.pred._tag === 'Not') {
    return optimizePredicate(input.pred.pred);
  }

  if (input._tag === 'And') {
    if (input.preds.length === 0) {
      return bool(true);
    }

    const pred = input.preds[0];

    if (pred !== undefined && input.preds.length === 1) {
      return optimizePredicate(pred);
    }

    if (input.preds.length > 1) {
      const preds: Predicate[] = [];

      for (const p of input.preds) {
        const optimized = optimizePredicate(p);

        if (optimized._tag === 'Boolean') {
          if (optimized.value === false) {
            return optimized;
          }
        } else {
          preds.push(optimized);
        }
      }

      if (preds.length === 0) {
        return bool(true);
      }

      if (preds.length === 1 && preds[0]) {
        return preds[0];
      }

      return and(...preds);
    }
  }

  /*
   * В тексте E2.3 предлагается вернуть lit(x === y), но Literal относится
   * к Expr, а не к Predicate. Поэтому постоянный результат представлен
   * отдельным Predicate-узлом Boolean.
   *
   * optimizePredicate всегда возвращает Predicate. optimizeSelect удаляет
   * только верхнеуровневый Boolean(true) из optional-поля where, тогда как
   * Boolean(false) сохраняется и компилируется в WHERE FALSE.
   *
   * Этот контракт расходится с исходным acceptance-тестом, ожидающим null,
   * поэтому выбранное представление нужно согласовать с ментором.
   */

  if (input._tag === 'Eq') {
    if (input.left._tag === 'Literal' && input.right._tag === 'Literal') {
      return bool(input.left.value === input.right.value);
    }
  }

  if (input._tag === 'Or') {
    const unique = new Set(input.preds);
    const preds: Predicate[] = [];

    for (const pred of unique) {
      const optimized = optimizePredicate(pred);

      if (optimized._tag === 'Boolean') {
        if (optimized.value === true) {
          return optimized;
        } else {
          continue;
        }
      }
      preds.push(optimized);
    }

    if (preds.length === 0) {
      return bool(false);
    }

    if (preds.length === 1 && preds[0] !== undefined) {
      return preds[0];
    }

    return or(...preds);
  }

  return input;
};

export const optimizeSelect = (ir: SelectIR): SelectIR => {
  if (ir.where === undefined) return ir;

  const where = optimizePredicate(ir.where);

  if (where._tag === 'Boolean' && where.value === true) {
    const { where: _, ...rest } = ir;
    return rest;
  }

  return { ...ir, where };
};
