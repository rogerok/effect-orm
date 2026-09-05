# Learning records

Подтверждённые результаты обучения: что пользователь уже объяснил, реализовал или проверил. Это не журнал каждого шага; текущий маршрут и задания находятся в [карте обучения](../index.html), а рабочие решения — в [заметках](../NOTES.md).

## Как связаны материалы

- [MISSION.md](../MISSION.md) задаёт текущую цель E2.6: DataLoader для связи один-ко-многим.
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

### E2.5: кеширование компиляции

16. [0016 — граница переиспользования Compiled](0016-compiled-cache-reuse-boundary.md): содержимое IR, литералы и диалект.
17. [0017 — создание кеша и повторное использование](0017-cached-allocation-versus-reuse.md): повторное исполнение внешнего эффекта создаёт новый кеш.
18. [0018 — коллизия не означает равенство](0018-hash-collision-is-not-equality.md): возврат по одному хешу может отдать Compiled другого запроса.
19. [0019 — синхронный кеш компиляции работает](0019-synchronous-compile-cache-reuse.md): четыре обращения, две компиляции; Effect.cached пока не добавлен.
20. [0020 — обработка IR стала ленивой](0020-lazy-compile-cache-request.md): компиляция начинается при исполнении эффекта, а не при вызове compileCache.
21. [0021 — поиск по свежему IR дороже компиляции](0021-structural-lookup-costs-more-than-compile.md): speedup < 1 при свежих деревьях; выигрыш в сценарии с одним объектом IR.

Связанный материал: [урок 0010 — время жизни Effect.cached](../lessons/0010-cached-effect-lifetime.html). Синхронное переиспользование по содержимому IR проверено; следующий шаг — хранение кешированного эффекта.

### E2.6: Request batching

22. [0022 — миссия перешла к E2.6 DataLoader](0022-mission-shift-e2-6-dataloader.md): следующая цель — один SQL-батч и отдельный массив постов для каждого `userId`; понимание механизма пока не подтверждено.

Связанный материал: [урок 0011 — один SQL, много массивов постов](../lessons/0011-one-batch-many-post-lists.html) и [памятка Effect Request один-ко-многим](../references/effect-request-one-to-many.html).

## Опорные справочники

- [AST — дерево обычных объектов](../references/ast-tree-basics.html) — записи 0005–0007.
- [Проход optimizer для Predicate AST](../references/optimizer-pass.html) — записи 0008–0015.
- [Инварианты оптимизатора Predicate](../references/0001-predicate-optimizer-invariants.html) — проверочная матрица E2.3.
- [Free/AST-пайплайн запросов](../references/free-ast-query-pipeline.html) — записи 0001–0004.
- [Время жизни Effect.cached](../references/cached-effect-lifetime.html) — опора к уроку 0010.
- [Effect Request один-ко-многим](../references/effect-request-one-to-many.html) — контракт request, группировка строк и completion каждого entry для E2.6.
