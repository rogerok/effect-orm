# Concepts

## 1. Runtime IR и typed wrapper

**Concept:** Runtime intermediate representation (IR) против типизированной обёртки.

**Why it matters:** ORM должна отдельно хранить исполнимую структуру запроса и compile-time информацию о типе выражения/результата. Смешение границ ведёт либо к тяжёлому runtime representation, либо к ложной уверенности, что TypeScript валидирует строки БД.

**Where it appears in this project:** `src/compiler/ir.ts`, `src/query/typed-ast.ts`, `src/query/typed-run.ts`, `src/query/typed-stream.ts`.

**Prerequisites:** discriminated unions, generics, type erasure.

**Expected mastery:** 4.

**How mastery will be verified:** пользователь без исходника объясняет, какие поля существуют в JavaScript, где живёт `R`, и показывает один случай, где raw DB row нарушает compile-time promise.

## 2. Phantom marker

**Concept:** Phantom marker — поле типа, которое связывает generic parameter со structural compatibility, но не обязано существовать в runtime object.

**Why it matters:** без использования `T` в структуре `Expr<T>` generic parameter не защищает сравнение выражений разных value types.

**Where it appears in this project:** unique symbol `Brand` в `src/query/typed-ast.ts` и signatures в `src/query/predicates.ts`.

**Prerequisites:** structural typing, generics, erased types.

**Expected mastery:** 4.

**How mastery will be verified:** compile-time experiment до/после удаления marker плюс объяснение, почему runtime output не меняется.

## 3. Type-state FSM через разные class surfaces

**Concept:** Конечный автомат (finite state machine, FSM), где каждое состояние представлено отдельным классом и набором методов.

**Why it matters:** запрещает `execute()` до projection и запрещает продолжать изменять запрос после перехода в executable state без runtime flags.

**Where it appears in this project:** будет добавлен в builder урока 3 как `SelectQueryBuilder<S> → ExecutableQuery<R>`.

**Prerequisites:** classes, generic return types, API invariants.

**Expected mastery:** 4.

**How mastery will be verified:** таблица valid/invalid transitions, negative type cases и реализация двух состояний без state casts в public API.

## 4. Immutable persistent builder

**Concept:** Каждый modifier возвращает новый builder с новым state; старый экземпляр остаётся неизменным.

**Why it matters:** общий query prefix можно безопасно разветвить, а type-level state не расходится с мутировавшим runtime object.

**Where it appears in this project:** будущие `where`, `innerJoin`, `orderBy`, `limit`, `offset`.

**Prerequisites:** readonly data, shallow/deep mutation, object/array copying.

**Expected mastery:** 4.

**How mastery will be verified:** две ветки от одного builder компилируются в разные SQL, а исходный `toIR()` не меняется.

## 5. SourceMap и alias environment

**Concept:** Type-level dictionary `alias → table metadata`, который описывает доступные источники текущего запроса.

**Why it matters:** после join API должен разрешать только реальные aliases и колонки соответствующей таблицы.

**Where it appears in this project:** будущий builder поверх существующих `TableDef`, `JoinIR` и qualified `Column` expressions.

**Prerequisites:** mapped types, indexed access, literal types, `keyof`.

**Expected mastery:** 4.

**How mastery will be verified:** после двух join доступны ровно три aliases; неизвестный alias и неизвестная колонка дают compile-time errors.

## 6. Рост generic context через intersection

**Concept:** Переход `S → S & { [K in A]: T }` добавляет новый источник, сохраняя предыдущие.

**Why it matters:** fluent join должен на каждом шаге расширять autocomplete и type checking, не теряя старые sources.

**Where it appears in this project:** return type `innerJoin`/`leftJoin` будущего `SelectQueryBuilder`.

**Prerequisites:** intersections, mapped types, generic inference.

**Expected mastery:** 4.

**How mastery will be verified:** пользователь выводит тип после двух joins, объясняет, почему union неверен, и обрабатывает alias collision явно.

## 7. ExpressionBuilder с контекстом sources

**Concept:** Smart constructors, чьи допустимые column references зависят от текущего SourceMap.

**Why it matters:** глобальный `col(table, name)` не выражает query-local aliases; join callbacks должны видеть только sources конкретной query chain.

**Where it appears in this project:** адаптация `src/query/expressions.ts` и `predicates.ts` в future builder callbacks.

**Prerequisites:** SourceMap, `InferColumn`, typed Expr/Pred.

**Expected mastery:** 4.

**How mastery will be verified:** `b.col('u', 'id')` и `b.col('p', 'id')` имеют правильные types/runtime aliases, а invalid references не компилируются.

## 8. Projection inference

**Concept:** Преобразование object selection `{ key: Expr<T> }` в result row `{ key: T }`.

**Why it matters:** пользователь получает точный тип результата по выбранным expressions и собственным output aliases.

**Where it appears in this project:** future `.select((b) => ({ ... }))`, existing `Projection` и `Select<R>`.

**Prerequisites:** conditional types, `infer`, mapped types.

**Expected mastery:** 4.

**How mastery will be verified:** type-level examples для нескольких value types и runtime query с переименованными projection keys.

## 9. SQL aliases и identifier safety

**Concept:** Table alias — SQL identifier из контролируемого schema/builder context; literal value — параметр через placeholder.

**Why it matters:** aliases устраняют неоднозначность joined columns, а разделение identifier/value защищает parameterization boundary.

**Where it appears in this project:** `Dialect.quoteIdentifier`, `compileExpr`, `compileSelect`, future `Db.selectFrom(table, alias)`.

**Prerequisites:** SQL identifiers, placeholders, injection model.

**Expected mastery:** 4.

**How mastery will be verified:** пользователь предсказывает qualified SQL, params и показывает, почему placeholder нельзя использовать вместо identifier.

## 10. INNER JOIN semantics

**Concept:** INNER JOIN возвращает только совпавшие combinations rows и не добавляет nullability источникам.

**Why it matters:** builder должен корректно формировать ON predicate и result type для нескольких таблиц.

**Where it appears in this project:** `JoinIR`, `compiler.ts`, future `innerJoin`.

**Prerequisites:** basic SELECT, aliases, boolean predicates.

**Expected mastery:** 3.

**How mastery will be verified:** реальный two-table scenario с match/non-match и точный predicted row set.

## 11. LEFT JOIN source nullability

**Concept:** При отсутствии match все projected columns правой source становятся nullable независимо от declared column nullability.

**Why it matters:** иначе public result type обещает значение там, где DB возвращает `NULL`.

**Where it appears in this project:** future SourceMap metadata и `ExpressionBuilder.col`; `JoinIR.kind` уже поддерживает `left`.

**Prerequisites:** INNER JOIN, conditional types, SQL NULL.

**Expected mastery:** 4.

**How mastery will be verified:** compile-time type `T | null` и runtime unmatched row совпадают; inner-joined source остаётся `T`.

## 12. Cardinality contracts

**Concept:** «много строк», «первая или not found», «ровно одна» — разные observable contracts.

**Why it matters:** вызывающий код должен различать нормальное отсутствие данных и нарушение uniqueness/invariant.

**Where it appears in this project:** `NotFoundError`, `TooManyError`, future `ExecutableQuery` terminals.

**Prerequisites:** Effect typed errors, array boundaries.

**Expected mastery:** 4.

**How mastery will be verified:** 0/1/2-row matrix с точными success/error outcomes и обоснованием названий методов.

## 13. Effect execution boundary

**Concept:** Query construction создаёт data; terminal method создаёт lazy Effect; runtime запускается только interpreter.

**Why it matters:** builder остаётся testable без Driver, dependencies остаются explicit, а ошибки/ресурсы контролирует Effect runtime.

**Where it appears in this project:** `typed-run.ts`, `typed-stream.ts`, Driver service и future `ExecutableQuery`.

**Prerequisites:** `Effect<A,E,R>`, `Effect.gen`, Layer/provide.

**Expected mastery:** 4.

**How mastery will be verified:** fake Driver counter остаётся 0 после построения query/effect и становится 1 только после `runPromise`/test runtime.

## 14. Streaming и backpressure

**Concept:** Ограниченная память требует постепенного producer, non-materializing adapter и bounded consumer state.

**Why it matters:** тип `Stream` сам по себе не мешает producer сначала загрузить весь результат.

**Where it appears in this project:** `Driver.executeStream`, SQLite iterator, PGlite cursor/FETCH, `streamFromSelect`, E2.7.

**Prerequisites:** Effect execution, iterators/cursors, resource finalization.

**Expected mastery:** 4.

**How mastery will be verified:** source-code path не использует `executeRaw`/collect, миллионный fold даёт точный result, а пользователь объясняет heap retention и RSS limits.

## 15. Codec и runtime validation boundary

**Concept:** TypeScript types исчезают; raw SQL values должны быть decoded/validated, а domain values encoded с column metadata.

**Why it matters:** `as R` не доказывает форму/тип данных, особенно между SQLite и PostgreSQL representations.

**Where it appears in this project:** `codec.ts`, `ColumnDef._codec`, unchecked assertions в typed run/stream; future builder/Repository.

**Prerequisites:** schemas/codecs, unknown data, dialect representations.

**Expected mastery:** 4.

**How mastery will be verified:** boolean/date round-trip на двух backends и malformed raw row даёт typed decoding error вместо ложного domain value.

## 16. Write-builder FSM

**Concept:** INSERT/UPDATE/DELETE имеют собственные более короткие state machines.

**Why it matters:** invalid sequences вроде execute before values/set и неверные write values должны быть невозможны до SQL execution.

**Where it appears in this project:** existing Insert/Update/Delete IR/statements; future fluent write API.

**Prerequisites:** `InferInsert`, `InferUpdate`, typed statements, FSM.

**Expected mastery:** 4.

**How mastery will be verified:** valid flows исполняются, invalid method sequences/type values не компилируются, returning result inferred exactly.

## 17. Repository boundary

**Concept:** Repository — domain-oriented persistence facade, вводимый при повторяющихся use cases/mapping, а не заранее.

**Why it matters:** отделяет raw rows/query mechanics от domain contracts и делает not-found/validation behavior явным.

**Where it appears in this project:** пока отсутствует; становится оправданным после read/write builder и codecs.

**Prerequisites:** complete builder, tagged errors, mapping/validation.

**Expected mastery:** 4.

**How mastery will be verified:** один concrete repository, затем обобщение на основании второго; tests проверяют domain behavior, не forwarding.

## 18. Effect Request batching

**Concept:** Concurrent logical requests группируются в один physical query, после чего resolver распределяет rows каждому entry.

**Why it matters:** устраняет N+1 без изменения публичного per-key contract.

**Where it appears in this project:** `src/hw/e2-6.ts` и test.

**Prerequisites:** Effect concurrency, grouping one-to-many, Driver context.

**Expected mastery:** 4.

**How mastery will be verified:** один SQL для нескольких concurrent requests, точная раздача групп и `[]` для отсутствующей key; sequential case объяснён отдельно.

## 19. Scope, transaction и savepoint

**Concept:** Transaction владеет connection в Scope; nested transaction использует savepoint; finalizers работают на success/failure/interruption.

**Why it matters:** multi-write use cases должны быть atomic и не протекать ресурсами.

**Where it appears in this project:** Driver lifecycle уже scoped; transaction API ещё отсутствует.

**Prerequisites:** Effect Scope/Fiber, SQL transaction semantics, tagged errors.

**Expected mastery:** 4.

**How mastery will be verified:** two-write failure rolls back, nested savepoint сохраняет outer work, interruption освобождает resource.

## 20. Identity Map и Unit of Work

**Concept:** Identity Map обеспечивает одну identity entity на key внутри scope; Unit of Work собирает changes и commit-ит их одной транзакцией.

**Why it matters:** нужны только после появления domain entities и coordinated changes; раньше это лишняя сложность.

**Where it appears in this project:** будущий domain layer после Repository.

**Prerequisites:** Repository, Scope, transactions, entity identity.

**Expected mastery:** 3.

**How mastery will be verified:** repeated find identity внутри scope, isolation между scopes, ordered commit и rollback при failure.

## 21. Versioned migrations

**Concept:** Последовательность идентифицированных schema transitions с metadata о применённых версиях.

**Why it matters:** без воспроизводимого schema lifecycle ORM остаётся локальным query experiment.

**Where it appears in this project:** пока отсутствует; финальная core-фаза.

**Prerequisites:** DDL, transactions, Driver portability, filesystem/package boundaries.

**Expected mastery:** 4.

**How mastery will be verified:** clean DB migrate, repeated no-op, ordered dependencies, checksum mismatch и rollback failed migration.

## 22. Public package surface

**Concept:** Явный список поддерживаемых exports и работоспособный built consumer contract.

**Why it matters:** внутренние source imports могут работать, когда опубликованный package сломан. Сейчас exports ожидают `dist/index.*`, но source entrypoint отсутствует.

**Where it appears in this project:** `package.json`, `tsconfig.build.json`, будущий `src/index.ts`.

**Prerequisites:** Node ESM, declaration emit, package exports/import conditions.

**Expected mastery:** 3.

**How mastery will be verified:** clean `pnpm build` и временный внешний consumer импортируют JS и declarations только через public package name.
