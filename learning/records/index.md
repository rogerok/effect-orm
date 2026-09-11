# Learning records

Подтверждённые результаты обучения: что пользователь уже объяснил, реализовал или проверил. Это не журнал каждого шага; текущий маршрут и задания находятся в [карте обучения](../index.html), а рабочие решения — в [заметках](../NOTES.md).

## Как связаны материалы

- [MISSION.md](../MISSION.md) задаёт текущую цель урока 3: минимальный Phantom-typed Builder поверх завершённого typed AST.
- [Уроки](../lessons/) дают задания в порядке, удобном для прохождения.
- [Справочники](../references/) открываются после самостоятельной попытки.
- Этот каталог фиксирует только подтверждённые результаты и связывает их с соответствующими уроками.

Записи 0001, 0004, 0022 и 0024 удалены при аудите 2026-09-08: они фиксировали только смену цели или были явно помечены
как superseded. Номера не переиспользуются; удалённые файлы доступны в истории git.

## Хронология

### Миссия и базовые границы

2. [0002 — расширение AST требует двух видов проверки](0002-ast-extension-boundaries.md)
3. [0003 — Effect описывает исполнение, а не запускает его](0003-effect-execution-boundary.md)
4. [0005 — исходная точка: фронтенд без опыта с компиляторами и ORM](0005-frontend-background-first-ast.md)

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

23. [0023 — one-to-many batch раздаёт отдельные массивы](0023-one-to-many-batch-distribution.md): реализация создаёт и дополняет группы, возвращает `[]` для отсутствующей группы и прошла сквозную проверку одного SQL на три request.

Связанный материал: [урок 0011 — один SQL, много массивов постов](../lessons/0011-one-batch-many-post-lists.html) и [памятка Effect Request один-ко-многим](../references/effect-request-one-to-many.html).

### E2.7: потоковый full table scan

25. [0025 — typed stream сохраняет ленивость](0025-typed-stream-preserves-laziness.md): Driver извлекается при terminal operation, raw stream адаптируется к `R`, а fake Driver подтверждает один вызов и постоянный fold-аккумулятор.
26. [0026 — SQLite stream работает сквозным проходом](0026-sqlite-stream-fold-end-to-end.md): реальный `stmt.iterate()` передал три строки в `runFold`, который вернул точные count и sum.
27. [0027 — миллион строк свёрнут через Stream](0027-million-row-stream-fold.md): standalone SQLite scan вернул точные count и sum без массива результатов.
28. [0028 — V8 heap отделён от RSS](0028-heap-retention-versus-rss.md): forced GC проверяет удержание JS-объектов, а RSS включает native allocations и не доказывает утечку Stream.

Связанный материал: [урок 0012 — Stream не гарантирует малую память](../lessons/0012-stream-is-not-an-array.html) и [памятка по потоковому full table scan](../references/streaming-full-table-scan.html).

## Урок 3: Phantom-typed Builder

29. [0029 — модель runtime/type-only границы подтверждена](0029-l3-0-boundary-model-confirmed.md): L3.0 закрыт — классификация шести элементов, двойная жизнь alias, TS2693 для `S`-как-значения и IR как единственная валюта до компилятора.
30. [0030 — FSM, single-source SourceMap и contextual col подтверждены](0030-l3-fsm-sourcemap-contextual-col.md): два состояния запрещают неверный порядок методов, literal alias сохраняет конкретный `TableDef`, а `col` связывает alias/column с точным `Expr<T>` и обычным runtime IR.
31. [0031 — immutable Builder разделяет runtime и type-only state](0031-l3-5-immutable-builder-state.md): `selectFrom` создаёт начальный runtime state без `SourceMap`, modifier сохраняет общий prefix, а structural sharing остаётся безопасным только при запрете мутации.

32. [0032 — `ExecutableQuery<R>` переносит границу FSM в runtime API](0032-l3-10-executable-query-boundary.md): множество методов класса запрещает модификаторы после `select`, `R` отвечает только за тип результата, а способ сборки объекта решает, создаётся ли ключ со значением `undefined`.

33. [0033 — `execute()` делегирует существующему typed `run`](0033-l3-11-execute-delegates-to-typed-run.md): вызов `execute()` не обращается к `Driver`, требование объявлено в третьем параметре `Effect`, а подсказка `unnecessaryEffectGen` требует удалить обёртку, а не заменить её другой.

34. [0034 — cardinality terminals и цена непроверенного приведения типа](0034-l3-12-cardinality-terminals.md): три контракта количества строк разведены, `sql` для ошибок приходит из `runWithSql`, а `as unknown as` на всём объекте трижды скрыл ошибку формы результата.

35. [0035 — тесты трёх terminals и мутационная проверка](0035-l3-12-terminals-test-and-mutation-check.md): семь случаев на фейковом драйвере без реальной базы; зелёный набор пропускал неверный `count`, пока мутация это не показала.

36. [0036 — `innerJoin` расширяет SourceMap и создаёт JoinIR](0036-l3-14-inner-join-source-extension.md): пересечение типов добавляет alias, `on` видит обе стороны, physical table и alias лежат в разных полях IR, а исходный builder остаётся односточниковым.

37. [0037 — политика повторного alias](0037-l3-15-duplicate-alias-policy.md): пересечение с занятым ключом компилируется молча, а SQL отклоняется во время исполнения по-разному в PostgreSQL и SQLite; выбрана документация вместо запрета.

38. [0038 — `leftJoin` и `null` вместо обещанного `string`](0038-l3-left-join-runtime-null.md): LEFT JOIN сохраняет несовпавшую левую строку и заполняет правые колонки `null`, тогда как тип результата этого ещё не выражает.

39. [0039 — `selectAll()` ограничен единственным источником](0039-e3-1-select-all-single-source.md): `this` parameter отклоняет вызов после join, признак вычисляется из числа ключей `S`, а тип строки собирается из `S[keyof S]` и `InferRow`.

40. [0040 — nullability как метаданные источника](0040-l3-21-source-nullability-metadata.md): `SourceMap` хранит пару `{ table, nullable }`, граница держит `boolean`, а литералы приходят из возвращаемых типов трёх производителей; `ON` фильтрует пары строк до подстановки NULL, поэтому внутри callback источник ещё не nullable.

41. [0041 — nullability источника в типе выражения](0041-l3-22-source-nullability-in-col.md): условный тип в `col`
    проверен через тип строки результата; две мутации ломают ровно по одному утверждению, а объединение `string | null
| null` нормализуется, поэтому две причины `null` складываются без взаимного влияния. Упражнение E3.2 закрыто.

42. [0042 — INSERT FSM без RETURNING](0042-l3-24-insert-fsm.md): начальное состояние не имеет `execute`;
    тип и значение результата проверены отдельно, мутация `returning` обнаружена тестом, исходный код восстановлен.

43. [0043 — несколько строк INSERT](0043-l3-25-multirow-insert.md): проверены общий список колонок, параметры,
    отказ при разных наборах колонок и реальные строки SQLite. Самостоятельное объяснение остаётся учебным долгом.
44. [0044 — Repository проверен через публичный интерфейс](0044-e3-4-repository-contract.md): семь постоянных
    тестов закрепляют CRUD, nullable-фильтры, metadata-driven primary key, ошибки, дефект INSERT RETURNING и типовые
    запреты; основные сценарии E3.4 подтверждены.

## Опорные справочники

- [AST — дерево обычных объектов](../references/ast-tree-basics.html) — записи 0005–0007.
- [Проход optimizer для Predicate AST](../references/optimizer-pass.html) — записи 0008–0015.
- [Инварианты оптимизатора Predicate](../references/0001-predicate-optimizer-invariants.html) — проверочная матрица E2.3.
- [Free/AST-пайплайн запросов](../references/free-ast-query-pipeline.html) — записи 0002–0005.
- [Время жизни Effect.cached](../references/cached-effect-lifetime.html) — опора к уроку 0010.
- [Effect Request один-ко-многим](../references/effect-request-one-to-many.html) — контракт request, группировка строк и completion каждого entry для E2.6.
- [Потоковый full table scan](../references/streaming-full-table-scan.html) — producer, typed adapter, fold и границы memory measurement для E2.7.
