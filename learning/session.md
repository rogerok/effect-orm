# Session

## Intent

Продолжить урок 3 курса: Phantom-typed Builder. L3.0 завершён: подтверждены границы runtime IR, type-only `SourceMap`/`R` и Effect-зависимости. Текущий шаг — спроектировать FSM допустимых вызовов до реализации builder.

## Current phase

Фаза 0 curriculum: type-state FSM для single-table fluent builder.

## Current task

**L3.1 — задать допустимые переходы между `SelectQueryBuilder<S>` и `ExecutableQuery<R>`.**

Ожидаемый учебный результат текущего шага:

- `SelectQueryBuilder<S>` предоставляет только операции построения запроса;
- `.select(...)` завершает построение и возвращает `ExecutableQuery<R>`;
- `ExecutableQuery<R>` предоставляет только terminal operations и `toIR`;
- `execute` до `select` и query modifiers после `select` запрещены отсутствием метода, а не runtime flag.

## Evidence from repository

- Runtime language: `src/compiler/ir.ts`.
- Typed wrapper: `src/query/typed-ast.ts`.
- Existing functional API: `src/query/expressions.ts`, `predicates.ts`, `statements.ts`.
- Interpreter: `src/compiler/compiler.ts`.
- Effect execution: `src/query/typed-run.ts`.
- Streaming terminal foundation: `src/query/typed-stream.ts`.
- Join IR/compiler support already exists, but no public fluent builder exists.
- E2.7 is complete according to `learning/NOTES.md` and records 0025–0028; old E2.7 mission must no longer drive the next lesson.

## Teaching mode

Backend mentoring remains active:

1. one high-signal prediction;
2. smallest user-authored change;
3. narrow type/runtime check;
4. short explanation in the user's words;
5. next step only after the current invariant is observed.

Do not paste a complete builder implementation. Do not front-load Repository, transactions, relations or write builders.

## First diagnostic prompt for the next learning turn

Дать несколько цепочек вызовов и попросить пользователя классифицировать их как valid/invalid, называя класс объекта после каждого перехода. Включить минимум:

- `selectFrom(...).select(...).execute()`;
- `selectFrom(...).execute()`;
- `selectFrom(...).where(...).select(...).execute()`;
- `selectFrom(...).select(...).where(...)`.

## Next implementation boundary

После правильной классификации пользователь описывает только поверхности двух состояний и compile-only negative cases. Runtime `BuilderState`, `SourceMap`, joins и execution delegation в этот шаг не добавляются.

## Completion criteria for the current task

- Пользователь правильно классифицирует valid/invalid sequences.
- Пользователь называет тип объекта до и после `.select(...)`.
- Compile-only examples подтверждают отсутствие `execute` до `select` и отсутствие `where` после `select`.
- Пользователь объясняет, какую ошибку два класса предотвращают раньше runtime.

## Open uncertainties

- Самостоятельное проектирование type-state FSM ещё не проверено.
- JOIN SQL semantics и aliases остаются непроверенными.
- Course-вариант внутреннего `as never` в `ExpressionBuilder` нельзя копировать без сформулированного runtime-инварианта и поиска более узкого adapter.
- Целевым продуктом пока остаётся ORM package: отдельное приложение-потребитель в репозитории отсутствует.
