# Curriculum: Effect ORM

## Назначение маршрута

Проект — самостоятельный пакет ORM/query builder, а не HTTP-приложение. Практический результат маршрута: библиотека,
которая строит типобезопасные запросы, исполняет их через Effect-драйверы, корректно управляет ресурсами и транзакциями
и может обновлять схему БД через миграции.

Маршрут начинается с фактического состояния: foundation и основной Free/AST-пайплайн урока 2 уже реализованы; следующий
незавершённый продуктовый пробел — неудобная сборка `SelectIR` через функции и options-объекты без fluent API и
безопасных aliases для join.

Шкала mastery находится в [progress.md](progress.md). Каждая фаза завершается наблюдаемой проверкой и объяснением
решения своими словами. Наличие кода без такой проверки не означает mastery.

## Фаза 0. Вход в урок 3: восстановить границы существующего пайплайна

**Цель:** не строить новый builder поверх неверной модели уже существующих слоёв.

**Функциональность:** новая функциональность не добавляется; фиксируется путь
`schema value → typed constructor → runtime AST → compile → Driver → Effect` и граница compile-time обещания формы
строки.

**Предыдущие знания:** реализованные schema definitions, AST, compiler, typed `run`, Stream и драйверы.

### Knowledge

- Отличать runtime IR от типизированной обёртки `Select<R>` и `Expr<T>`.
- Понимать, что phantom marker влияет на TypeScript compatibility, но не существует в JavaScript.
- Понимать, почему сборка запроса чистая, а получение `Driver` начинается только при исполнении.

### Implementation

- Без копирования собрать минимальный single-table `SelectIR` текущими конструкторами.
- Предсказать SQL и порядок `params` до запуска compiler.

### Reasoning

- Объяснить, почему builder должен быть адаптером к текущему AST, а не вторым представлением SQL.
- Назвать доверительную границу raw row → `R` и отсутствие runtime validation.

### Debugging

- Различать ошибку формы AST, ошибку TypeScript inference, ошибку compile и ошибку Driver.
- По типу `Effect<A, E, R>` определить success, typed error и dependency channels.

**Практические задачи:** входная диагностика; один ручной прогноз AST/SQL; карта ответственности модулей.

**Критерии mastery:** пользователь своими словами восстанавливает весь путь запроса и правильно предсказывает, что
удаление phantom marker меняет type safety, но не runtime AST.

**Что становится возможным:** проектировать builder как отдельный compile-time API, переиспользующий существующий
runtime pipeline.

## Фаза 1. Fluent SELECT для одной таблицы

**Цель:** устранить практическую проблему громоздкого options API, не добавляя join и Repository раньше необходимости.

**Функциональность:** `Db.selectFrom(table, alias)` создаёт immutable builder; `where`, `orderBy`, `limit`, `offset`
накапливают состояние; `select` завершает построение и возвращает executable query; `toIR` выдаёт существующий
`SelectIR`.

**Предыдущие знания:** TableDef, `Expr<T>`, `Pred`, SelectIR, smart constructors, compiler.

### Knowledge

- Конечный автомат (finite state machine, FSM) на уровне типов.
- Разные классы как разные допустимые состояния API.
- Immutable/persistent builder: метод возвращает новое состояние, исходная ветка не меняется.
- Вывод результата projection через mapped и conditional types.

### Implementation

- Описать `Builder` без дублирования IR-семантики.
- Реализовать single-source `ExpressionBuilder` и projection callback.
- Перевести projection object в IR aliases.
- Реализовать `SelectQueryBuilder<S>` и `ExecutableQuery<R>` с разными наборами методов.

### Reasoning

- Обосновать два класса вместо строкового generic state.
- Обосновать чистый namespace `Db` вместо преждевременного Effect service.
- Объяснить, почему immutable builder позволяет безопасно форкать общий префикс запроса.

### Debugging

- Читать ошибки `keyof`, indexed access и generic inference от alias/column.
- Находить расхождение между type state и runtime `Builder` через `toIR()`.
- Проверять повторный `where`: новый предикат не должен молча стирать предыдущий, если контракт fluent API предполагает
  их совместное действие.

**Практические задачи:** минимальный `selectFrom`; один модификатор за шаг; projection; compile-only negative cases;
fork двух запросов от общего builder.

**Критерии mastery:** корректный AST/SQL single-table запроса; тип результата точно соответствует projection; `execute`
недоступен до `select`, а `where` недоступен после него; исходный builder не мутируется.

**Что становится возможным:** безопасно расширять контекст колонок при join и подключить исполнение без изменения
compiler.

## Фаза 2. Исполнение и cardinality contracts

**Цель:** превратить готовый AST в Effect-native пользовательский API с явной семантикой количества строк.

**Функциональность:** `execute()` возвращает массив; `executeOne()` различает отсутствие строки; строгий вариант
различает ноль, одну и несколько строк; `executeStream()` переиспользует уже реализованный typed Stream adapter.

**Предыдущие знания:** typed `run`, `Driver`, `DriverError`, `NotFoundError`, `TooManyError`, `streamFromSelect`.

### Knowledge

- Cardinality contract: many, at least one/first, exactly one.
- Ленивость Effect: построение запроса не выполняет I/O.
- Почему `toIR()` остаётся чистым, а execution требует `Driver`.

### Implementation

- Делегировать существующим `run`/stream boundaries вместо копирования compiler и Driver-кода.
- Вернуть точные success/error/environment channels для каждого terminal method.
- Написать поведенческие проверки 0/1/2 rows.

### Reasoning

- Выбрать и назвать точную семантику каждого метода, не прятать несколько контрактов под одним названием.
- Обосновать место assertion raw row → `R` или заменить её runtime decoding там, где проект получает достаточную
  metadata.

### Debugging

- Отличать созданный Effect от исполненного Effect.
- Находить забытый `yield*` по runtime-значению Effect внутри результата.
- Разделять compiler error и typed Driver failure.

**Практические задачи:** `execute`; три cardinality cases; Stream terminal; fake Driver для проверки SQL и вызовов.

**Критерии mastery:** до terminal operation Driver не вызывается; каждый cardinality case возвращает ожидаемый success
или точный tagged error; Stream не проходит через `executeRaw`.

**Что становится возможным:** использовать builder в реальном joined query и затем в persistence facade.

## Фаза 3. Aliases и INNER JOIN

**Цель:** решить реальную неоднозначность одинаковых имён колонок из нескольких таблиц.

**Функциональность:** `innerJoin(table, alias, on)` расширяет доступное пространство источников; `b.col(alias, column)`
принимает только зарегистрированный alias и колонку соответствующей таблицы; projection объединяет колонки разных
sources.

**Предыдущие знания:** фаза 1, mapped types, `TableDef`, существующие `JoinIR` и compiler support.

### Knowledge

- `SourceMap` как type-level environment доступных sources.
- Рост generic context через intersection/mapped type.
- Различие physical table name, SQL alias и TypeScript key.
- ON predicate видит старые и только что добавленный source.

### Implementation

- Построить `SourceMap` для одного alias.
- Расширять его каждым inner join без потери прежних sources.
- Сформировать `JoinIR` и квалифицированные `Column` expressions.
- Добавить compile-time negative cases для неизвестного alias и неизвестной колонки.

### Reasoning

- Объяснить, почему пользовательский identifier должен приходить из schema/alias literal, а value — через placeholder.
- Локализовать неизбежную type assertion на внутренней границе и сформулировать поддерживаемый ею инвариант.

### Debugging

- Диагностировать alias collision и несогласованность type-level/runtime source map.
- По SQL отличать неверный `table` у Column от ошибки projection alias.
- Проверять порядок join и видимость sources в `on` callback.

**Практические задачи:** один join; два join; одинаковое имя `id` у разных таблиц; неверные alias/column cases.

**Критерии mastery:** валидный joined query компилируется и исполняется; три намеренно неверные ссылки отклоняются
TypeScript; `toIR` показывает правильные table aliases и ON predicate.

**Что становится возможным:** корректно моделировать LEFT JOIN nullability и richer query features.

## Фаза 4. LEFT JOIN и честная nullability

**Цель:** не обещать `string`, когда SQL вправе вернуть `NULL` для отсутствующей joined row.

**Функциональность:** sources содержат metadata `{ table, nullable }`; inner source остаётся non-nullable, right side
LEFT JOIN становится nullable; projection отражает это как `T | null`.

**Предыдущие знания:** SourceMap, `InferColumn`, SQL join semantics.

### Knowledge

- Row-preserving семантика LEFT JOIN.
- Разница nullable column и nullable joined source.
- Распределение nullability по projected expressions.

### Implementation

- Расширить SourceMap metadata, не меняя runtime IR без необходимости.
- Вывести `Expr<T | null>` для колонок nullable source.
- Проверить строку с match и строку без match на реальной SQLite/PGlite БД.

### Reasoning

- Обосновать, почему nullability — часть типа результата, а не только документация.
- Не смешивать nullability источника с declared nullable отдельной колонки.

### Debugging

- Находить ошибочно узкий result type по unmatched row.
- Читать nested conditional/indexed access type errors.

**Практические задачи:** left join single match/no match; type assertion через `expectTypeOf`; сравнение с inner join.

**Критерии mastery:** runtime `NULL` и compile-time `T | null` совпадают; inner join не получает лишний `null`.

**Что становится возможным:** безопасные relation queries и Repository, которые не маскируют отсутствие связанных
данных.

## Фаза 5. Write builder и codec boundary

**Цель:** убрать асимметрию: чтение имеет fluent API, а запись всё ещё требует прямых constructors; одновременно решить
реальную границу TS value ↔ DB value.

**Функциональность:** typed `insertInto().values().returning()`, `update().set().where()`, `deleteFrom().where()`; codec
metadata применяется там, где известны таблица и колонка.

**Предыдущие знания:** `InferInsert`, `InferUpdate`, Insert/Update/Delete IR, codecs, terminal execution.

### Knowledge

- Более простые FSM write operations.
- Variadic tuple inference для `returning(...cols)`.
- Encode/decode как runtime transformation, не TypeScript cast.
- Почему positional `params` без column metadata недостаточно для encode.

### Implementation

- Реализовать каждый write flow отдельно.
- Сохранить parameterization всех values.
- Применить codec по ColumnDef и вернуть typed decoded result.

### Reasoning

- Определить, где именно metadata ещё доступна и где она теряется.
- Обосновать отказ от codec layer, который видит только `(sql, params)`.

### Debugging

- Диагностировать разные наборы колонок multi-row insert.
- Проверять affectedRows против returning rows.
- Отличать schema mismatch от codec failure.

**Практические задачи:** insert одной строки; multi-row insert; update/delete with where; returning subset; boolean/date
round-trip на двух dialects.

**Критерии mastery:** compile-time запрещает неверные write values; runtime round-trip даёт одинаковые domain values на
SQLite и PGlite; SQL values всегда параметризованы.

**Что становится возможным:** Repository получает стабильный query/write primitive и оправдан повторяющимися use cases.

## Фаза 6. Repository как доменная граница

**Цель:** скрыть повторяющуюся persistence-механику только после появления полного builder API.

**Функциональность:** table-specific `findById`, `findOne`, `findMany`, `insert`, `update`, `delete`; выбор cardinality
превращается в явный доменный контракт.

**Предыдущие знания:** read/write builder, tagged errors, codecs.

### Knowledge

- Repository как фасад persistence, не generic DAO и не бизнес-service.
- Разница row model и domain entity.
- Runtime validation at boundary через Effect Schema, когда внешние/DB данные больше нельзя считать доверенными.

### Implementation

- Начать с одного реального Repository, извлечь общий generic только после повтора.
- Маппить rows в domain values и сохранять typed errors.
- Проверять public behavior без mock echo tests.

### Reasoning

- Обосновать необходимость Repository конкретным повтором или доменной логикой.
- Решить, какие ошибки остаются persistence errors, а какие становятся domain errors.

### Debugging

- Локализовать дефект между builder result, mapping и domain invariant.
- Отличать not found от connection/query failure.

**Практические задачи:** один User repository; find/update not-found cases; mapping/validation error; второй repository
как проверка абстракции.

**Критерии mastery:** Repository не протекает raw SQL/driver rows наружу; методы имеют разные осмысленные contracts;
abstraction удаляет реальный повтор.

**Что становится возможным:** Identity Map и Unit of Work получают доменные entities и понятную persistence boundary.

## Фаза 7. Транзакции, Scope, Identity Map и Unit of Work

**Цель:** обеспечить атомарное изменение нескольких entities и предсказуемый lifecycle ресурсов.

**Функциональность:** transaction API с rollback; nested transaction через savepoint; request/scoped Identity Map; Unit
of Work собирает изменения и коммитит одной транзакцией.

**Предыдущие знания:** Effect Scope/Fiber/Layer, Driver lifecycle, Repository, tagged errors.

### Knowledge

- Transaction atomicity и savepoint semantics.
- Scope lifetime против Fiber lifetime.
- Identity Map: один identity → один managed instance в пределах scope.
- Unit of Work: отслеживание и ordering changes, а не глобальный cache.

### Implementation

- Сначала реализовать transaction primitive и rollback test.
- Затем nested savepoint behavior.
- Затем scoped Identity Map и только после неё Unit of Work commit.

### Reasoning

- Выбрать границу transaction ownership.
- Объяснить, почему глобальная Identity Map нарушает isolation/lifetime.
- Определить commit/rollback policy для ошибок приложения.

### Debugging

- Воспроизводить partial write и доказывать rollback тем же сценарием.
- Диагностировать leaked connection/finalizer и savepoint nesting.
- Находить stale entity state и неверный update ordering.

**Практические задачи:** two-write rollback; nested savepoint; repeated find identity; dirty tracking; commit failure.

**Критерии mastery:** наблюдаемая атомарность на реальной БД; finalizers работают при success/failure/interruption; один
scope не делит identity state с другим.

**Что становится возможным:** прикладные use cases могут безопасно изменять агрегаты; библиотека готова к migration
lifecycle.

## Фаза 8. Миграции и готовность пакета

**Цель:** превратить учебный набор модулей в воспроизводимо собираемый и обновляемый пакет.

**Функциональность:** migrations table, ordered `up`, checksum/duplicate protection, rollback policy; public entrypoint
и build artifacts; одна documented end-to-end программа на поддерживаемых backends.

**Предыдущие знания:** schema metadata, Driver, transactions, Node ESM/package exports.

### Knowledge

- Миграция как versioned state transition, а не автосинхронизация schema.
- Atomic migration application и idempotent startup check.
- Public package surface против внутренних модулей.

### Implementation

- Создать migrations runner на одном dialect, затем доказать portable subset или явные dialect migrations.
- Добавить корректный `src/index.ts` только при формировании public API; сейчас package export указывает на
  `dist/index.*`, а source entrypoint отсутствует.
- Проверить clean install/build/import consumer scenario.

### Reasoning

- Выбрать forward-only или reversible policy и назвать стоимость каждого варианта.
- Отделить library public contract от учебных `src/hw` и examples.
- Зафиксировать реально поддерживаемые drivers; `libsql.executeStream` сейчас является незавершённым контрактом.

### Debugging

- Диагностировать partial migration, checksum mismatch и порядок версий.
- Читать ESM resolution errors между development import condition и built package.
- Отличать type declaration/export defect от runtime import defect.

**Практические задачи:** migrations metadata table; две последовательные migrations; failure rollback; package
entrypoint; consumer smoke test; backend compatibility matrix.

**Критерии mastery:** пустая БД приводится к ожидаемой schema; повторный migrate не меняет её; неуспешная migration не
оставляет partial state; `pnpm build` создаёт импортируемый public package; end-to-end query проходит на заявленных
backends.

**Что становится возможным:** проект можно использовать как законченную минимальную ORM-библиотеку и развивать
осознанными extension-фазами.

## После core: расширения только по практической потребности

- Aggregations и GROUP BY FSM — когда появится запрос с группировкой.
- Relations API — отдельный mini-language; не требуется для завершения core ORM.
- Db как Effect service — только если подмена всего facade даёт пользу поверх подмены Driver.
- Optimistic locking, soft delete, replicas — после появления соответствующего прикладного требования.
- HTTP boundary и authentication не входят в текущий продукт: добавлять их следует только при появлении отдельного
  приложения-потребителя.
