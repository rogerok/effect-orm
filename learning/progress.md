# Progress

## Шкала

- 0 — не встречал
- 1 — узнаю концепцию
- 2 — могу объяснить с помощью
- 3 — могу реализовать с помощью
- 4 — могу реализовать самостоятельно
- 5 — могу объяснить, реализовать, отладить и сравнить альтернативы

Оценка консервативна: код в репозитории показывает контакт с концепцией, но не всегда авторство или самостоятельность. Уровни 4–5 не выставлены без независимой реализации и объяснения trade-offs.

## Текущая фаза

**Урок 3 — Phantom-typed Builder, проектирование type-state FSM.**

## Текущая задача

Задать допустимые и недопустимые цепочки вызовов для `SelectQueryBuilder<S>` и `ExecutableQuery<R>`.

Ближайший implementation step после подтверждения модели: compile-only поверхности двух классов, где `execute` отсутствует до `select`, а query modifiers отсутствуют после `select`.

## Что уже реализовано

- Schema values и inference для row/insert/update.
- Tagged Driver errors.
- Dialects PostgreSQL/SQLite.
- Drivers для PGlite, better-sqlite3 и libSQL; streaming реально реализован только для PGlite и better-sqlite3.
- Runtime AST/IR, smart constructors, compiler, pretty printer и predicate optimizer.
- Typed expressions/statements и typed `run`.
- Compile cache experiment.
- Effect Request one-to-many batching exercise.
- Typed Stream adapter, SQLite integration test и миллионный streaming experiment.
- Cross-cutting Driver layers: tracing, metrics, retry, timeout/slow-query behavior.

## Известные технологии

Под «известные» здесь понимается присутствие в практическом коде, а не гарантированный mastery.

- strict TypeScript 7, ESM/NodeNext, package import maps;
- Effect 4 RC: Effect, Context Service, Layer, Scope, Stream, Request/RequestResolver, Schedule, Metric, Match;
- PostgreSQL semantics через PGlite;
- SQLite через better-sqlite3 и libSQL;
- Vitest и `@effect/vitest`;
- pnpm, tsgo language service, oxlint, Prettier, Husky/lint-staged.

## Оценка mastery

| Концепция                                      | Уровень | Основание                                                                                                        |
| ---------------------------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript: generics, unions, narrowing |       3 | Пользователь реализовывал typed AST/optimizer и исправлял type errors с помощью.                                 |
| Conditional и mapped types                     |       2 | В schema inference присутствуют; самостоятельная работа с растущим SourceMap ещё не проверена.                   |
| Phantom marker / type erasure                  |       2 | Граница `_tag` против marker разбиралась; отдельного подтверждённого результата в records нет.                   |
| Runtime AST и discriminated unions             |       3 | Подтверждены чтение вложенного дерева и реализация optimizer rules.                                              |
| Pure compiler `AST + Dialect → SQL + params`   |       3 | Compiler и расширения проверялись с помощью; самостоятельное восстановление целого pipeline ещё нужно проверить. |
| SQL parameterization и identifier quoting      |       2 | Используется во многих заданиях; системное объяснение threat boundary не зафиксировано.                          |
| Базовый SQL DDL/DML                            |       1 | Пользователь явно сообщал, что почти не знает БД; VALUES/recursive CTE освоены локально.                         |
| SQL JOIN и aliases                             | unknown | IR/compiler содержат join, но самостоятельная семантика и типизация join не проверены.                           |
| Effect lazy execution и `yield*`               |       3 | Подтверждена execution boundary; забытый `yield*` был найден через runtime observation.                          |
| Effect services/Layers и dependency channel    |       3 | Driver context и `provideContext` применялись с помощью в E2.6.                                                  |
| Typed errors и `catchTag`                      |       2 | Ошибки и tests существуют; проектирование нового cardinality contract ещё не проверено.                          |
| Scope/Fiber/resource lifetime                  |       2 | Интерактивный материал пройден, но объяснение пользователя не подтверждено record.                               |
| Effect Request batching                        |       3 | Реализован и проверен one-to-many resolver с одним SQL batch.                                                    |
| Effect Stream/backpressure                     |       3 | Typed adapter и миллионный fold реализованы с помощью; producer/consumer boundary объяснена.                     |
| Memory retention: heapUsed/RSS                 |       3 | Пользователь правильно объяснил forced-GC контрпример; record 0028.                                              |
| Behavioral testing                             |       3 | Пользователь писал integration/acceptance tests, но первоначально не проверил SQL/params в DataLoader test.      |
| Type-level API testing                         |       2 | `expectTypeOf` использован; negative compile-time contracts builder ещё не проектировались.                      |
| Fluent immutable builder                       | unknown | В проекте отсутствует.                                                                                           |
| Type-state FSM через class surfaces            | unknown | Это новая центральная концепция урока 3.                                                                         |
| SourceMap через intersection types             | unknown | Это новая центральная концепция урока 3.                                                                         |
| LEFT JOIN nullability                          | unknown | Не реализована и не проверена.                                                                                   |
| Repository / Data Mapper boundary              |       1 | Термины присутствуют только в курсе; проект ещё не создаёт domain entities.                                      |
| Transactions/savepoints                        | unknown | Реализации и подтверждённой практики нет.                                                                        |
| Identity Map / Unit of Work                    |       0 | В текущем коде отсутствуют.                                                                                      |
| Migrations                                     |       0 | В текущем коде отсутствуют.                                                                                      |
| Public package design/build consumption        |       1 | package metadata есть, но `src/index.ts` отсутствует при export на `dist/index.*`.                               |

## Концепции, которые считаются знакомыми, но требуют retrieval check

- AST как данные и `_tag` narrowing.
- Отложенное исполнение Effect.
- Driver в environment channel.
- Typed query как compile-time promise поверх raw rows.
- Stream producer/adapter/consumer и постоянный fold accumulator.

Эти темы не нужно преподавать заново. Сначала короткий прогноз или самостоятельное восстановление; объяснение добавляется только по обнаруженному пробелу.

## Непроверенные концепции урока 3

- два класса как states FSM;
- method availability как compile-time transition;
- сохранение alias literal без widening;
- SourceMap и его рост через intersection;
- indexed access `S[A]['_columns'][C]`;
- projection inference `Expr<T> → T`;
- синхронизация type-level SourceMap и runtime BuilderState;
- alias collisions;
- LEFT JOIN source nullability;
- cardinality semantics `execute`/`executeOne`/strict exactly-one.

## Ближайшая учебная цель

Самостоятельно описать переход:

```text
SelectQueryBuilder<S>
  --select(projection)--> ExecutableQuery<R>
```

и доказать через compile-only cases:

1. `execute` недоступен до `select`;
2. `where` и другие query modifiers недоступны после `select`;
3. valid sequence заканчивается terminal operation;
4. недопустимое состояние нельзя выразить, поэтому runtime flag не нужен.

После этого — создать single-source type environment `{ [K in A]: T }`, не смешивая его с runtime `BuilderState`.

## Текущие риски проекта, не являющиеся оценкой пользователя

- `package.json` экспортирует `dist/index.js`/`dist/index.d.ts`, но `src/index.ts` сейчас отсутствует.
- `libsql.executeStream` возвращает `Stream.empty`, то есть capability выглядит реализованной, хотя является no-op.
- `typed-run` и typed stream используют unchecked raw-row assertion; runtime schema validation отсутствует.
- Cross-cutting layers в текущем виде просто пробрасывают `executeStream`, поэтому tracing/metrics/retry behavior потоковых запросов не эквивалентен `executeRaw`.
- Builder урока 3 отсутствует полностью; существующий JoinIR сам по себе не доказывает готовый joined API.
