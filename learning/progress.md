# Progress

## Шкала

- 0 — не встречал
- 1 — узнаю концепцию
- 2 — могу объяснить с помощью
- 3 — могу реализовать с помощью
- 4 — могу реализовать самостоятельно
- 5 — могу объяснить, реализовать, отладить и сравнить альтернативы

Оценка консервативна: код в репозитории показывает контакт с концепцией, но не всегда авторство или самостоятельность.
Уровни 4–5 не выставлены без независимой реализации и объяснения trade-offs.

## Текущая фаза

**Урок 3 — Phantom-typed Builder, отделение законченного запроса.**

## Текущая задача

**E3.5 (L3.29): подключение column codec к результатам SELECT. Шаг выдан, результат не подтверждён.**

Базовая линия перепроверена запуском на SQLite: проекция над колонкой `bool()` вернула `1` и `0`
при `typeof === 'number'`, тогда как тип результата обещает `boolean`. Далее — история E3.4,
долги которого остаются открытыми.

Пользователь перешёл к E3.4; долги L3.27–L3.28 не закрыты автоматически.
В `src/query/make-repository.ts` поиск по частичному объекту условий возвращает строку либо `null`.
`pnpm check-types` — код `0`. Временный сценарий на SQLite подтвердил совпадение по двум полям,
`null` при отсутствии строки, независимость последовательных вызовов и сохранение ошибки `DbError`.
Преобразование через `Effect.map(Option.getOrNull)` применено с подсказкой; самостоятельность не подтверждена.
Пользователь реализовал `findMany`: `selectAll().execute()` и публичный метод фабрики.
`pnpm check-types` и временный сценарий на SQLite прошли: две совпадающие строки, пустой массив без совпадений,
одна строка по двум условиям; предыдущие сценарии `findBy` также прошли. Порядок строк не фиксировался.
Пользователь реализовал `PrimaryKeyName<T>` с помощью: условие `_pk`, отображение в имя `K` и индексирование
по ключам колонок. `pnpm check-types` прошёл; дополнительная проверка compiler API TypeScript 6.0.3
на виртуальном исходнике подтвердила `"id"` и `"externalId"` для двух схем. Самостоятельность не подтверждена.
Пользователь завершил `findById` с типом аргумента `InferRow<T>[PrimaryKeyName<T>]`.
Объяснил нежелательный `undefined` от `Partial`. Ограничение ключей через `& string` позволило пройти
`pnpm check-types` без утверждения типа для `pk`; ранее предложенное утверждение оказалось ненужным.
SQLite-сценарий подтвердил поиск по числовому и текстовому ключу с разными именами колонок,
`null` при отсутствии строки, независимость вызовов и сохранение `DbError`.
Схема без ключа вызывает `PrimaryKeyError` при создании репозитория.
Дополнительные виртуальные проверки TypeScript 6.0.3 подтвердили запрет неверного типа ключа и `undefined`.
Повторная проверка текущего `findById` на SQLite прошла для числового ключа, текстового `externalId`
при наличии отдельного `id` и отсутствующей записи. `pnpm check-types` прошёл.
Для следующего шага `save` выполнен пример существующего INSERT builder:
вход `{ name: 'Anna' }` вернул через `RETURNING` строку с сгенерированным `id = 1` и `age = 18` из SQL DEFAULT.
E3.4 завершён и закреплён в `src/query/make-repository.test.ts`. Семь тестов публичного интерфейса проверяют:
CRUD, точные строки и отсутствие совпадений, пустой и nullable-фильтры, сохранность соседних строк,
числовой и текстовый первичный ключ, отсутствие PK, сохранение ошибки драйвера и дефект пустого INSERT RETURNING.
Проверки типов запрещают неверный ключ, изменение PK, неверное условие и отсутствие обязательного INSERT-поля.
`pnpm check-types` прошёл; три query test-файла — 22 теста прошли; oxlint изменённых файлов — без замечаний.
Старые закомментированные определения типов удалены. Подробности — [запись 0044](records/0044-e3-4-repository-contract.md).
Пользователь написал Repository с помощью; постоянные тесты написал наставник по явному разрешению.
Самостоятельное восстановление сложных типов и Effect-переходов не подтверждено.

Для E3.5 исходный сценарий SELECT boolean-колонки под ключом `enabled` возвращает SQLite-значения `1`/`0`,
декодер пока не применяется.

Упражнение E3.2 закрыто целиком. L3.22 подтверждён: условный тип в `col` наблюдается через тип строки результата, две
мутации ломают ровно по одному утверждению, объединение `string | null | null` нормализуется. Подробности — в
[записи 0041](records/0041-l3-22-source-nullability-in-col.md).

Закрытые шаги урока 3 и записи с подробностями:

| шаг                 | результат                                                                          | запись                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L3.0–L3.9           | границы пайплайна, FSM, SourceMap, `col`, immutable state, projection              | [0029](records/0029-l3-0-boundary-model-confirmed.md), [0030](records/0030-l3-fsm-sourcemap-contextual-col.md), [0031](records/0031-l3-5-immutable-builder-state.md) |
| L3.10–L3.11         | `ExecutableQuery<R>`, `execute()` через typed `run`                                | [0032](records/0032-l3-10-executable-query-boundary.md), [0033](records/0033-l3-11-execute-delegates-to-typed-run.md)                                                |
| L3.12               | три cardinality terminals и тесты с мутационной проверкой                          | [0034](records/0034-l3-12-cardinality-terminals.md), [0035](records/0035-l3-12-terminals-test-and-mutation-check.md)                                                 |
| L3.14, L3.16, L3.17 | `innerJoin`: рост SourceMap, ON в расширенном контексте, JoinIR                    | [0036](records/0036-l3-14-inner-join-source-extension.md)                                                                                                            |
| L3.15               | политика повторного alias — документация вместо запрета                            | [0037](records/0037-l3-15-duplicate-alias-policy.md)                                                                                                                 |
| —                   | `leftJoin` написан пользователем вне очереди; тип ещё не выражает `null`           | [0038](records/0038-l3-left-join-runtime-null.md)                                                                                                                    |
| L3.13 (E3.1)        | `selectAll()` только при одном источнике, ограничение через `this`                 | [0039](records/0039-e3-1-select-all-single-source.md)                                                                                                                |
| L3.20–L3.21         | `SourceMap` хранит `Source<T, N>`; флаги источников проверены типами               | [0040](records/0040-l3-21-source-nullability-metadata.md)                                                                                                            |
| L3.22 (E3.2)        | nullability источника видна в типе строки результата; E3.2 закрыто                 | [0041](records/0041-l3-22-source-nullability-in-col.md)                                                                                                              |
| L3.24 (E3.3)        | INSERT FSM без `returning`, тип и значение результата, мутационная проверка        | [0042](records/0042-l3-24-insert-fsm.md)                                                                                                                             |
| L3.25 (E3.3)        | Практика multi-row INSERT подтверждена; самостоятельное объяснение остаётся долгом | [0043](records/0043-l3-25-multirow-insert.md)                                                                                                                        |
| E3.4                | Repository проверен через публичный интерфейс и типовые запреты                    | [0044](records/0044-e3-4-repository-contract.md)                                                                                                                     |

Пропущены и остаются долгом: L3.18 (две колонки `id` под разными ключами результата) и L3.19 (второй join). Тестов на
join в репозитории нет.

## Что уже реализовано

До урока 3: schema values и inference, tagged Driver errors, диалекты PostgreSQL/SQLite, драйверы PGlite,
better-sqlite3 и libSQL, runtime AST/IR со smart constructors, компилятор, pretty printer и predicate optimizer, typed
expressions/statements и typed `run`, compile cache, Request batching, typed Stream, cross-cutting Driver layers
(tracing, metrics, retry, timeout). Streaming реально работает только в PGlite и better-sqlite3.

Builder урока 3: `selectFrom(table, alias)` создаёт immutable `SelectQueryBuilder<S>` с runtime `BuilderState` и
type-only `SourceMap`; `where` накапливает предикаты через `And`, `orderBy` дополняет список критериев, `limit` и
`offset` заменяют собственные поля; `innerJoin` и `leftJoin` расширяют `SourceMap` пересечением и добавляют один `Join`
в IR; запись `SourceMap` — это `Source<T, N>` с признаком nullability, `false` у `selectFrom` и `innerJoin`, `true` у
`leftJoin`; `select(callback)` переводит запрос в `ExecutableQuery<R>` с `toIR()`, `execute()`, `executeOne()` и
`executeOneOrThrow()`. Контракты terminals покрыты `src/query/builder.test.ts`.

L3.24 закрыт: пользователь реализовал `insertInto`, `InsertQueryBuilder.values` и `ExecutableInsert.execute` в
`src/query/write-builders.ts`. `toIR` оставлен по его решению. Проверены SQL и параметры, отложенное обращение к
драйверу, точный результат `{ affectedRows: 1 }`, тип результата и отсутствие `execute` до `values`.
Пользователь сообщил об ошибке теста после мутации `returning: '*'` и восстановил исходный код.
После восстановления `pnpm check-types` и девять тестов двух builder-файлов прошли.
Подробности — [0042](records/0042-l3-24-insert-fsm.md). Самостоятельное объяснение связи `R` и `returning`
ещё не подтверждено; уровень освоения не повышен.

## Известные технологии

Под «известные» здесь понимается присутствие в практическом коде, а не гарантированный mastery.

- strict TypeScript 7, ESM/NodeNext, package import maps;
- Effect 4 RC: Effect, Context Service, Layer, Scope, Stream, Request/RequestResolver, Schedule, Metric, Match;
- PostgreSQL semantics через PGlite;
- SQLite через better-sqlite3 и libSQL;
- Vitest и `@effect/vitest`;
- pnpm, tsgo language service, oxlint, Prettier, Husky/lint-staged.

## Оценка mastery

| Концепция                                      | Уровень | Основание                                                                                                                                                                   |
| ---------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript: generics, unions, narrowing |       3 | Пользователь реализовывал typed AST/optimizer и исправлял type errors с помощью.                                                                                            |
| Conditional и mapped types                     |       3 | Пользователь реализовал single-source mapped type с literal alias и negative cases с помощью.                                                                               |
| Phantom marker / type erasure                  |       3 | Пользователь объяснил, что `R` не участвует в разрешении методов, и реализовал `ExecutableQuery<R>`; запись 0032.                                                           |
| Runtime AST и discriminated unions             |       3 | Подтверждены чтение вложенного дерева и реализация optimizer rules.                                                                                                         |
| Pure compiler `AST + Dialect → SQL + params`   |       3 | Compiler и расширения проверялись с помощью; самостоятельное восстановление целого pipeline ещё нужно проверить.                                                            |
| SQL parameterization и identifier quoting      |       2 | Используется во многих заданиях; системное объяснение threat boundary не зафиксировано.                                                                                     |
| Базовый SQL DDL/DML                            |       1 | Пользователь явно сообщал, что почти не знает БД; VALUES/recursive CTE освоены локально.                                                                                    |
| SQL JOIN и aliases                             |       2 | Прогноз на изменённых данных совпал с наблюдением; оба следствия названы без подсказки, запись 0036.                                                                        |
| Effect lazy execution и `yield*`               |       3 | Пользователь уточнил границу: `execute()` не читает `Driver`, требование объявлено в типе; запись 0033.                                                                     |
| Effect services/Layers и dependency channel    |       3 | Driver context и `provideContext` применялись с помощью в E2.6.                                                                                                             |
| Typed errors и `catchTag`                      |       3 | Пользователь реализовал три cardinality contract с ошибками в error channel; канал успеха путался, запись 0034.                                                             |
| Scope/Fiber/resource lifetime                  |       2 | Интерактивный материал пройден, но объяснение пользователя не подтверждено record.                                                                                          |
| Effect Request batching                        |       3 | Реализован и проверен one-to-many resolver с одним SQL batch.                                                                                                               |
| Effect Stream/backpressure                     |       3 | Typed adapter и миллионный fold реализованы с помощью; producer/consumer boundary объяснена.                                                                                |
| Memory retention: heapUsed/RSS                 |       3 | Пользователь правильно объяснил forced-GC контрпример; record 0028.                                                                                                         |
| Behavioral testing                             |       3 | Написал семь случаев контрактов с fake Driver; состав утверждений и связь calls/строк потребовали разбора.                                                                  |
| Type-level API testing                         |       3 | Compile-only positive/negative FSM cases подтверждены через `@ts-expect-error` и `pnpm check-types`.                                                                        |
| Мутационная проверка тестов                    |       2 | Метод показан агентом: зелёный набор пропускал неверный `count`, пока код не сломали намеренно.                                                                             |
| Сужение типа и `noUncheckedIndexedAccess`      |       2 | Проверка длины не сужает элемент; объяснено на изолированном примере, самостоятельно не восстановлено.                                                                      |
| Непроверенные приведения как источник дефектов |       2 | Форма результата ломалась трижды при молчащем `tsc`; сужение приведения до одного значения показано агентом.                                                                |
| Fluent immutable builder                       |       3 | Пользователь реализовал фабрику и modifier с помощью; initial state и независимость веток подтверждены временным проверочным скриптом.                                      |
| Type-state FSM через class surfaces            |       3 | Пользователь перенёс FSM из compile-only упражнения в runtime API и объяснил причину запрета; запись 0032.                                                                  |
| `exactOptionalPropertyTypes` и сборка объекта  |       2 | Правка выполнена после объяснения на literal-примере; самостоятельное объяснение не подтверждено.                                                                           |
| Ограничение вызова через `this` parameter      |       2 | Метод реализован, но условный тип `this` был показан целиком после трёх итераций; запись 0039.                                                                              |
| Распределение условных типов по объединению    |       1 | Приём `IsUnion` разобран на подстановках и наблюдаемой таблице; самостоятельного вывода не было.                                                                            |
| SourceMap через intersection types             |       3 | `innerJoin` реализован по списку ограничений; расширение alias и два negative type case подтверждены, запись 0036.                                                          |
| LEFT JOIN nullability                          |       3 | Условный тип и три утверждения на тип строки написаны пользователем и подтверждены двумя мутациями; форма `SourceMap` до этого исправлялась четыре раза. Записи 0040, 0041. |
| Граница типа против конкретного типа           |       2 | Различие constraint и аннотации разобрано на `nullable: boolean` против литералов; подстановка `Record<string, Source<...>>` самостоятельно не восстановлена.               |
| Чтение ошибок компилятора как диагностика      |       2 | Приём «развернуть индексируемый тип по цепочке объявлений при `TS2536`» показан наставником; молчание `check-types` при расходящемся `on` пользователем не замечено.        |
| Repository / Data Mapper boundary              |       1 | Термины присутствуют только в курсе; проект ещё не создаёт domain entities.                                                                                                 |
| Transactions/savepoints                        | unknown | Реализации и подтверждённой практики нет.                                                                                                                                   |
| Identity Map / Unit of Work                    |       0 | В текущем коде отсутствуют.                                                                                                                                                 |
| Migrations                                     |       0 | В текущем коде отсутствуют.                                                                                                                                                 |
| Public package design/build consumption        |       1 | package metadata есть, но `src/index.ts` отсутствует при export на `dist/index.*`.                                                                                          |

## Концепции, которые считаются знакомыми, но требуют retrieval check

- AST как данные и `_tag` narrowing.
- Отложенное исполнение Effect.
- Driver в environment channel.
- Typed query как compile-time promise поверх raw rows.
- Stream producer/adapter/consumer и постоянный fold accumulator.

Эти темы не нужно преподавать заново. Сначала короткий прогноз или самостоятельное восстановление; объяснение
добавляется только по обнаруженному пробелу.

## Непроверенные концепции урока 3

- сохранение alias literal без widening;
- indexed access `S[A]['table']['_columns'][C]`;
- projection inference `Expr<T> → T`;
- alias collisions;
- cardinality semantics `execute`/`executeOne`/strict exactly-one.

Признак nullability источника проверен и на уровне метаданных (запись 0040), и на уровне типа строки результата
(запись 0041).

## Ближайшая учебная цель

Практическая часть L3.25 подтверждена: SQL и параметры, отказ при разных наборах колонок, настоящий SQLite,
точные сохранённые строки и `affectedRows: 2`. Очистка теста завершена. `pnpm check-types` — код `0`,
12 тестов двух builder-файлов прошли. Самостоятельное объяснение порядка параметров остаётся учебным долгом;
уровень освоения не повышен. Подробности — [0043](records/0043-l3-25-multirow-insert.md).

Практический результат L3.26 подтверждён: `returning` возвращает выбранные поля на SQLite, тип результата
проверен на реальной цепочке, неизвестная колонка запрещена, исходный запрос сохраняет прежнее поведение.
Пользователь объяснил последствие изменения исходного запроса. Последние проверки: `pnpm check-types` — код `0`,
15 тестов обоих builder-файлов прошли. Мутация `returning: '*'` не выполнена; по повторной просьбе пользователя
двигаемся дальше с этим долгом. Самостоятельное объяснение const generic и распределения условного типа не подтверждено.

L3.27 реализован: `update(table).set(patch)`, `where` с контекстом одной таблицы и накоплением условий через `And`,
`returning`, `toIR`, `execute`. Временные сценарии на SQLite подтвердили результат без WHERE, выбранные поля
с `returning` и изменение только одной из двух строк с двумя условиями. `pnpm check-types` прошёл.
Постоянных тестов UPDATE ещё нет; обработка пустого SET остаётся открытой. Полное завершение L3.27 не заявлено.

L3.28 реализован: `ExecutableDelete<T, R>` и `deleteFrom(table)`. `pnpm check-types` прошёл.
Временный сценарий SQLite подтвердил два условия, выбранные поля удалённой строки, сохранение остальных строк,
пустой результат при повторном удалении, `affectedRows: 1`/`0`, независимость производных запросов и удаление без WHERE.
Текущая граница — общий этап постоянных тестов UPDATE и DELETE. Самостоятельное понимание параметров типа
статического метода не подтверждено: различие разобрано после ошибки, исправление выполнено с помощью.

## Текущие риски проекта, не являющиеся оценкой пользователя

- `package.json` экспортирует `dist/index.js`/`dist/index.d.ts`, но `src/index.ts` сейчас отсутствует.
- `libsql.executeStream` возвращает `Stream.empty`, то есть capability выглядит реализованной, хотя является no-op.
- `typed-run` и typed stream используют unchecked raw-row assertion; runtime schema validation отсутствует.
- Cross-cutting layers в текущем виде просто пробрасывают `executeStream`, поэтому tracing/metrics/retry behavior
  потоковых запросов не эквивалентен `executeRaw`.
- Смысл поля `count` в `TooManyError` не зафиксирован ни в типе, ни в документации.
- Граница FSM защищена только на уровне типов: `src/hw/e3-1.ts` и `src/hw/e3-2.test.ts` проверяются `pnpm check-types`,
  тестов на join во время исполнения в репозитории нет.
- `pnpm lint` даёт три предупреждения о неиспользуемых импортах в `src/query/expression-builder.ts` — остатки перехода
  на `AnyTableDef`.
