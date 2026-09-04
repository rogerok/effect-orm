# Learning records

Подтверждённые результаты обучения: что пользователь уже объяснил, реализовал или проверил. Это не журнал каждого шага; текущий маршрут и задания находятся в [карте обучения](../index.html), а рабочие решения — в [заметках](../NOTES.md).

## Как связаны материалы

- [MISSION.md](../MISSION.md) задаёт цель и границы разделов 2.1–2.5.
- [Уроки](../lessons/) дают задания в порядке, удобном для прохождения.
- [Справочники](../references/) открываются после самостоятельной попытки.
- Этот каталог фиксирует только подтверждённые результаты и связывает их с соответствующими уроками.

## Хронология

### Миссия и базовые границы

1. [0001 — миссия сменилась с Pool на Free/AST](0001-mission-shift-free-ast.md)
2. [0002 — расширение AST требует двух видов проверки](0002-ast-extension-boundaries.md)
3. [0003 — Effect описывает исполнение, а не запускает его](0003-effect-execution-boundary.md)
4. [0004 — базовая диагностика разделов 2.1–2.5](0004-free-ast-baseline-complete.md)
5. [0005 — исходная точка: фронтенд без опыта с компиляторами и ORM](0005-frontend-background-first-ast.md)

Связанный маршрут: [урок 0004](../lessons/0004-free-ast-query-boundaries.html) → [урок 0005](../lessons/0005-rebuild-minimal-query-pipeline.html).

### AST и E2.3

6. [0006 — двойной Not прочитан как вложенное дерево](0006-double-not-tree-navigation.md)
7. [0007 — вложенный Predicate требует отдельного сужения типа](0007-two-level-tag-narrowing.md)
8. [0008 — упрощение And зависит от числа детей](0008-and-cardinality-preserves-meaning.md)
9. [0009 — после удаления оболочки AST обрабатывается повторно](0009-recursive-rewrite-after-unwrapping.md)
10. [0010 — рекурсивный And использует источник и отдельный аккумулятор](0010-and-recursion-source-and-accumulator.md)
11. [0011 — SQL OR не возвращает один из операндов](0011-sql-or-does-not-return-operands.md)
12. [0012 — явный Boolean-предикат заменил скрытые null-константы](0012-explicit-boolean-predicate-and-and-identities.md)
13. [0013 — Or различает нейтральный false и поглощающий true](0013-or-constants-and-reference-deduplication.md)
14. [0014 — значение предиката отделено от наличия WHERE](0014-predicate-value-versus-where-presence.md)
15. [0015 — E2.3 завершён через явный Boolean-предикат](0015-e2-3-explicit-boolean-optimizer-complete.md)

Связанный маршрут: [урок 0007 — AST](../lessons/0007-ast-optimizer-from-frontend.html) → [урок 0006 — E2.3](../lessons/0006-e2-3-optimizer-pass.html) → [урок 0008 — constant folding](../lessons/0008-constant-predicate-boundary.html).

## Опорные справочники

- [AST — дерево обычных объектов](../references/ast-tree-basics.html) — записи 0005–0007.
- [Проход optimizer для Predicate AST](../references/optimizer-pass.html) — записи 0008–0015.
- [Инварианты оптимизатора Predicate](../references/0001-predicate-optimizer-invariants.html) — проверочная матрица E2.3.
- [Free/AST-пайплайн запросов](../references/free-ast-query-pipeline.html) — записи 0001–0004.
