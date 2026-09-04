import type { Predicate } from '#compiler/ir.js';

import { and, or } from '#compiler/ir-constructors.js';

export const optimizePredicate = (input: Predicate): Predicate | null => {
  if (input._tag === 'Not' && input.pred._tag === 'Not') {
    return optimizePredicate(input.pred.pred);
  }

  if (input._tag === 'And') {
    if (input.preds.length === 0) {
      return null;
    }

    const pred = input.preds[0];

    if (pred !== undefined && input.preds.length === 1) {
      return optimizePredicate(pred);
    }

    if (input.preds.length > 1) {
      const preds: Predicate[] = [];

      for (const p of input.preds) {
        const optimized = optimizePredicate(p);
        if (optimized !== null) {
          preds.push(optimized);
        }
      }

      if (preds.length === 0) {
        return null;
      }

      if (preds.length === 1 && preds[0]) {
        return preds[0];
      }

      return and(...preds);
    }
  }

  /*
   * В E2.3 указано:
   *
   *   Eq(lit(x), lit(y)) → lit(x === y)
   *
   * Однако Literal относится к Expr, а optimizePredicate возвращает
   * Predicate | null. Кроме того, acceptance-тест ожидает null для
   * Eq(lit(1), lit(1)).
   *
   * Текущая интерпретация:
   *
   * - null обозначает постоянный TRUE: на границе SelectIR.where
   *   он превращается в отсутствие WHERE;
   * - пустой Or() обозначает постоянный FALSE, поскольку компилятор
   *   преобразует его в SQL FALSE.
   *
   * Возможные решения:
   *
   * 1. Сохранить Predicate | null:
   *    null представляет TRUE, а Or() представляет FALSE.
   *
   * 2. Всегда возвращать Predicate:
   *    And() представляет TRUE, Or() представляет FALSE, а optimizeSelect
   *    отдельно удаляет верхнеуровневый And() из поля where.
   *
   * 3. Добавить в Predicate явный boolean-узел:
   *    например, { _tag: "Boolean"; value: boolean }, и научить компилятор
   *    преобразовывать его в SQL TRUE или FALSE.
   *
   * Нужно уточнить у, какой вариант предполагается заданием.
   * Также нужно определить область constant folding: применять JavaScript
   * === ко всем значениям unknown или только к безопасным примитивам.
   * Например, SQL-выражение NULL = NULL возвращает UNKNOWN, тогда как
   * JavaScript-выражение null === null возвращает true.
   */

  if (input._tag === 'Eq') {
    if (input.left._tag === 'Literal' && input.right._tag === 'Literal') {
      if (input.left.value === input.right.value) {
        return null;
      } else {
        return or();
      }
    }
  }

  return input;
};
