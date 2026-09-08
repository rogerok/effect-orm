# Roadmap

## Definition of done

Законченным результатом считается минимальная ORM-библиотека: typed read/write builder, корректные INNER/LEFT JOIN
types, Effect execution и streaming, Repository boundary, scoped transactions/Unit of Work, migrations и импортируемый
package entrypoint. Relations DSL, replicas и schema diff — расширения, а не условие завершения.

Каждый шаг проходит одинаковый цикл:

```text
concept → small task → пользователь реализует → агент проверяет → один comprehension check → следующий шаг
```

Переход запрещён, пока проверка текущего observable contract красная или пользователь не может объяснить обнаруженную
причинную связь.

## Текущая точка: вход в урок 3

### L3.0 — Восстановить существующий vertical slice

- **Concept:** builder является front-end к существующему AST.
- **Small task:** на бумаге/в чате восстановить `table → Expr/Pred → Select<R> → compile → Driver` и назвать
  runtime/type-level части.
- **Verification:** точный прогноз `_tag`, SQL и params для одного запроса.
- **Comprehension:** почему новый builder не должен сам генерировать SQL?

### L3.1 — Задать FSM допустимых вызовов

- **Concept:** состояние API выражается набором доступных методов.
- **Small task:** выписать valid и invalid sequences для `SelectQueryBuilder` и `ExecutableQuery`.
- **Verification:** compile-only examples показывают отсутствие `execute` до `select` и отсутствие `where` после
  `select`.
- **Comprehension:** какую ошибку предотвращают два класса по сравнению с runtime flag?

### L3.2 — Создать single-source type environment

- **Concept:** alias literal становится ключом SourceMap.
- **Small task:** вывести тип `{ [K in A]: T }` из `selectFrom(table, alias)`.
- **Verification:** `keyof Sources` равен только исходному alias; table type не widened до общего `TableDef`.
- **Comprehension:** почему `alias: string` разрушает autocomplete конкретного ключа?

### L3.3 — Собрать контекстный `col`

- **Concept:** nested indexed access связывает alias, column и `InferColumn`.
- **Small task:** реализовать только `ExpressionBuilder.col` для одной source.
- **Verification:** правильная колонка получает точный `Expr<T>`; неизвестный alias и column не компилируются.
- **Comprehension:** какая часть сигнатуры связывает выбранный alias с набором колонок?

### L3.4 — Подключить expression constructors

- **Concept:** новый facade переиспользует typed smart constructors.
- **Small task:** добавить `lit`, один binary predicate и один boolean combinator без копирования AST logic.
- **Verification:** output structural equality с текущими `query/predicates.ts` constructors.
- **Comprehension:** что сломается, если builder создаёт второй формат Predicate?

### L3.5 — Ввести immutable `Builder`

- **Concept:** persistent builder хранит runtime state отдельно от SourceMap type.
- **Small task:** создать начальное состояние `from/joins/orderBy` и метод, возвращающий новый экземпляр.
- **Verification:** общий prefix можно разветвить; изменение child не меняет `toIR` sibling.
- **Comprehension:** почему `readonly` поля сами по себе не спасают, если мутировать вложенный массив?

### L3.6 — Добавить `where`

- **Concept:** fluent accumulation должен иметь явную семантику.
- **Small task:** добавить один predicate callback и определить поведение повторного `where`.
- **Verification:** два `where` не теряют первый predicate; compiled SQL соответствует выбранной AND-семантике.
- **Comprehension:** чем overwrite отличается от накопления на observable SQL?

### L3.7 — Добавить `orderBy`, `limit`, `offset`

- **Concept:** независимые modifiers меняют только соответствующее поле state.
- **Small task:** реализовать по одному modifier, не объединяя всё в одну правку.
- **Verification:** `toIR` и compiled SQL после каждого modifier; предыдущий state неизменён.
- **Comprehension:** какие modifiers естественно append, а какие replace?

### L3.8 — Вывести тип projection

- **Concept:** object of `Expr<T>` преобразуется в object of `T`.
- **Small task:** описать `InferSelection` и проверить его отдельно от класса.
- **Verification:** `{ id: Expr<number>, name: Expr<string> }` выводит `{ id: number; name: string }`.
- **Comprehension:** где conditional `infer` извлекает value type?

### L3.9 — Преобразовать projection в IR

- **Concept:** key projection object становится SQL alias.
- **Small task:** реализовать `.select(callback)` и создать `Projection` с alias для каждого key.
- **Verification:** compiler выдаёт `AS` aliases, а порядок параметров сохраняется.
- **Comprehension:** почему result key и physical column name — разные понятия?

### L3.10 — Отделить `ExecutableQuery<R>`

- **Concept:** переход FSM завершает построение SELECT.
- **Small task:** `.select` возвращает второй класс только с `toIR` и terminals.
- **Verification:** negative type cases для вызовов после select; `toIR` имеет `Select<R>`.
- **Comprehension:** что гарантирует class surface, чего не гарантирует generic `R`?

### L3.11 — Выполнить query через существующий `run`

- **Concept:** execution adapter не дублирует compiler/Driver pipeline.
- **Small task:** реализовать `execute()` делегированием существующей границе.
- **Verification:** fake Driver видит один ожидаемый SQL/params; до Effect execution вызовов нет.
- **Comprehension:** почему `Db.selectFrom` не требует Driver, а `execute` требует?

### L3.12 — Добавить cardinality terminals

- **Concept:** many/first/exactly-one — разные contracts.
- **Small task:** отдельно реализовать cases 0, 1, 2 rows.
- **Verification:** точные success values и `_tag` ошибок `NotFoundError`/`TooManyError`.
- **Comprehension:** какой метод должен считать две строки допустимыми и почему?

### L3.13 — Single-table `selectAll`

- **Concept:** `*` безопасен только при однозначном result shape.
- **Small task:** разрешить `.selectAll()` только до join либо вернуть namespaced shape.
- **Verification:** single-source SQL `SELECT * ...`; после join неподдерживаемый вариант не компилируется.
- **Comprehension:** почему плоский `*` становится неоднозначным после join?

## INNER JOIN

### L3.14 — Расширить SourceMap новым alias

- **Concept:** `S & { [K in A]: T }` сохраняет старые и добавляет новый source.
- **Small task:** вычислить return type `innerJoin` без runtime реализации.
- **Verification:** type probes видят оба alias и их разные columns.
- **Comprehension:** почему union здесь не моделирует одновременную доступность sources?

### L3.15 — Ограничить alias collision

- **Concept:** alias — уникальный key query namespace.
- **Small task:** определить compile-time policy повторного alias.
- **Verification:** повторный alias отклоняется или имеет явно задокументированную безопасную семантику; silent
  overwrite отсутствует.
- **Comprehension:** какой runtime SQL дефект скрывает пересечение с уже существующим key?

### L3.16 — Построить ON predicate в расширенном контексте

- **Concept:** ON должен видеть обе стороны join.
- **Small task:** callback получает ExpressionBuilder нового SourceMap и возвращает Pred.
- **Verification:** join users/posts компилируется; неизвестная третья source отклоняется.
- **Comprehension:** почему callback нельзя строить на старом `S`?

### L3.17 — Сформировать JoinIR

- **Concept:** fluent join остаётся тонким AST adapter.
- **Small task:** добавить один `JoinIR` без изменения compiler.
- **Verification:** ожидаемые table/alias/on в `toIR`, затем точный SQL.
- **Comprehension:** какой существующий compiler branch уже выполняет эту работу?

### L3.18 — Доказать joined projection end-to-end

- **Concept:** одинаковые column names различаются alias и result key.
- **Small task:** выбрать `u.id` и `p.id` под разными result keys.
- **Verification:** type result и реальные SQLite rows совпадают.
- **Comprehension:** где устраняется конфликт двух `id` — в SQL source alias или projection alias?

### L3.19 — Два последовательных join

- **Concept:** SourceMap растёт монотонно.
- **Small task:** добавить третью table и использовать её в where/order/projection.
- **Verification:** все три sources доступны; исходный one-source builder остаётся one-source.
- **Comprehension:** почему immutable chain важна для type/runtime синхронности?

## LEFT JOIN и исполнение Stream

### L3.20 — Зафиксировать left-join runtime semantics

- **Concept:** unmatched right row даёт SQL NULLs.
- **Small task:** выполнить raw/IR left join с match и without match.
- **Verification:** наблюдаемая строка с null right columns.
- **Comprehension:** какая сторона сохраняется независимо от match?

### L3.21 — Добавить source nullability metadata

- **Concept:** nullable source отличается от nullable column.
- **Small task:** перейти к `{ table, nullable }` в SourceMap.
- **Verification:** исходный/inner source false, right left-joined source true.
- **Comprehension:** почему nullability принадлежит source metadata?

### L3.22 — Протянуть nullability в `col`

- **Concept:** conditional type добавляет `null` только нужной source.
- **Small task:** вернуть `Expr<T | null>` для nullable source.
- **Verification:** `expectTypeOf` для inner и left cases плюс реальная unmatched row.
- **Comprehension:** что произойдёт для declared nullable column из non-nullable source?

### L3.23 — Подключить `executeStream`

- **Concept:** новый terminal переиспользует lazy producer.
- **Small task:** делегировать `Select<R>` в `streamFromSelect`.
- **Verification:** fake Driver и малый SQLite fold; `executeRaw` не вызывается.
- **Comprehension:** где начинается streaming — в API return type или в driver producer?

## Write builder

### L3.24 — INSERT FSM

- **Concept:** `insertInto → values → returning?/execute`.
- **Small task:** одна строка без returning.
- **Verification:** exact SQL/params и affectedRows.
- **Comprehension:** какое состояние не должно иметь `execute`?

### L3.25 — Multi-row INSERT invariants

- **Concept:** каждая row имеет один и тот же ordered column set.
- **Small task:** две строки и deliberate mismatch.
- **Verification:** valid matrix executes; mismatch получает точную boundary failure до некорректного SQL.
- **Comprehension:** как columns header связан с каждым VALUES tuple?

### L3.26 — Variadic `returning`

- **Concept:** const generic/tuple сохраняет literal column keys.
- **Small task:** `returning('id', 'name')`.
- **Verification:** result type содержит только id/name; неизвестная column отклоняется.
- **Comprehension:** почему `string[]` потерял бы нужную точность?

### L3.27 — UPDATE FSM

- **Concept:** set values выводятся из `InferUpdate`, where строится в table context.
- **Small task:** update one field with where.
- **Verification:** PK нельзя set; value parameterized; exact affectedRows/returning behavior.
- **Comprehension:** почему optional patch не означает, что пустой SET — валидный SQL?

### L3.28 — DELETE FSM

- **Concept:** delete имеет table context и predicate, но не set.
- **Small task:** delete with where and returning case.
- **Verification:** exact SQL/params; отсутствие where рассматривается как отдельное осознанное решение, не случайность.
- **Comprehension:** какую защиту от mass delete должен давать API и на каком уровне?

### L3.29 — Codec round-trip

- **Concept:** encode/decode требуют column metadata.
- **Small task:** boolean или timestamp на SQLite и PGlite.
- **Verification:** один domain value даёт корректный DB representation и возвращается тем же domain type/value.
- **Comprehension:** почему generic Driver layer с `(sql, params)` не знает нужный codec?

## Доменный слой

### L4.0 — Найти оправдание Repository

- **Concept:** abstraction вводится после повторения и domain contract.
- **Small task:** отметить дублирование двух use cases поверх builder.
- **Verification:** будущий Repository API удаляет конкретный повтор, а не только переименовывает `.execute()`.
- **Comprehension:** чем Repository отличается от DAO в этом проекте?

### L4.1 — Один конкретный UserRepository

- **Concept:** persistence facade для aggregate/entity.
- **Small task:** `findById` и `insert` без generic factory.
- **Verification:** реальная DB; not-found contract; domain mapping.
- **Comprehension:** какие сырую строку или entity возвращает boundary?

### L4.2 — Runtime validation/mapping

- **Concept:** TypeScript тип не проверяет данные Driver во время исполнения.
- **Small task:** валидировать одну row через Schema/codec boundary.
- **Verification:** malformed fake/raw row даёт typed decoding failure.
- **Comprehension:** почему `as User` не является validation?

### L4.3 — Обобщить Repository после второго примера

- **Concept:** abstraction from evidence.
- **Small task:** добавить второй repository и извлечь только совпадающую механику.
- **Verification:** оба public contracts сохраняются; generic не требует `any`/unsafe public assertions.
- **Comprehension:** какая часть осталась domain-specific?

## Транзакции и Unit of Work

### L4.4 — Transaction success/rollback

- **Concept:** atomic boundary.
- **Small task:** два writes, ошибка между ними.
- **Verification:** после failure ни один write не виден.
- **Comprehension:** кто владеет connection во время transaction?

### L4.5 — Nested savepoint

- **Concept:** nested rollback не обязан отменять outer work.
- **Small task:** outer write + failing inner scope + outer continuation.
- **Verification:** exact final rows и driver commands.
- **Comprehension:** чем SAVEPOINT отличается от второго BEGIN?

### L4.6 — Scoped Identity Map

- **Concept:** identity uniqueness ограничена request/scope.
- **Small task:** два find одного id внутри scope и затем в новом scope.
- **Verification:** одинаковая identity внутри, независимая между scopes.
- **Comprehension:** почему global map создаёт stale/leak risk?

### L4.7 — Unit of Work commit

- **Concept:** changeset и one-transaction commit.
- **Small task:** new/dirty/deleted transitions по одному.
- **Verification:** exact writes/order и rollback on failure.
- **Comprehension:** чем managed state отличается от текущей row value?

### L4.8 — Interruption/finalization

- **Concept:** resources close on success, failure, interruption.
- **Small task:** interrupt transaction/use-case.
- **Verification:** finalizer observation и последующий checkout/operation успешно проходит.
- **Comprehension:** Scope и Fiber lifetime — одна граница или две?

## Миграции и выпуск пакета

### P1 — Migrations metadata

- **Concept:** versioned schema state.
- **Small task:** migrations table и чтение applied versions.
- **Verification:** empty DB reports none; initialized DB reports exact versions.
- **Comprehension:** зачем хранить checksum кроме номера?

### P2 — Apply one migration atomically

- **Concept:** migration transaction.
- **Small task:** один CREATE TABLE migration.
- **Verification:** success records version; deliberate failure leaves neither partial schema nor version row.
- **Comprehension:** что должно записываться первым — schema change или applied marker?

### P3 — Ordered batch and repeat run

- **Concept:** deterministic ordering/idempotent runner.
- **Small task:** две dependent migrations.
- **Verification:** correct order; второй запуск no-op; checksum mismatch fails loudly.
- **Comprehension:** почему повторное выполнение SQL не заменяет metadata table?

### P4 — Public package surface

- **Concept:** exports contract.
- **Small task:** выбрать public symbols и создать source entrypoint; не экспортировать `hw`/internal tests.
- **Verification:** `pnpm build` создаёт `dist/index.js` и `.d.ts` в соответствии с `package.json`.
- **Comprehension:** почему internal module availability не делает его public API?

### P5 — Consumer smoke test

- **Concept:** package correctness проверяется снаружи.
- **Small task:** временный consumer импортирует built package, создаёт table, выполняет typed query.
- **Verification:** runtime result и TypeScript types; временный consumer удаляется после проверки.
- **Comprehension:** что этот test ловит сверх project-local imports?

### P6 — Compatibility matrix and final cut

- **Concept:** supported backend contract должен быть честным.
- **Small task:** пройти один read/write/join/transaction scenario на SQLite и PGlite; решить статус libSQL streaming.
- **Verification:** заявленные scenarios проходят; unsupported capability явно не рекламируется и не реализована no-op.
- **Comprehension:** почему `Stream.empty` опаснее явного unsupported error?
