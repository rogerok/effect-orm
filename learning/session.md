# Session

## Intent

Урок 3 курса пройден до упражнений. Упражнение E3.2 (LEFT JOIN nullability) закрыто. Идёт упражнение E3.3 курса:
write-builder — INSERT, UPDATE, DELETE.

## Current phase

Read-builder урока 3 собран целиком: FSM из двух классов, `SourceMap` с признаком nullability,
`where`/`orderBy`/`limit`/`offset`, projection, три terminals, `innerJoin` и `leftJoin`; nullability источника доходит
до типа строки результата. История шагов и подтверждения — в [записях](records/index.md), таблица в
[progress.md](progress.md).

## Current task

**L3.25: INSERT нескольких строк — общий список колонок.**

L3.24 закрыт: пользователь написал начальное и исполняемое состояния INSERT, тест результата и два типовых
утверждения. Мутация `returning: '*'` обнаружена тестом; пользователь прислал ошибку и восстановил исходный `toIR`.
После восстановления `pnpm check-types` завершился с кодом `0`, девять тестов двух builder-файлов прошли.
Подробности — [запись 0042](records/0042-l3-24-insert-fsm.md).

По решению пользователя `ExecutableInsert.toIR(): Insert<R>` остаётся; `execute` использует `run(this.toIR())`.

Следующее действие до написания теста: спрогнозировать порядок параметров для двух строк
`[{ id: 1, name: 'John' }, { name: 'Ann', id: 2 }]`. Первая строка задаёт SQL-список колонок `("id", "name")`;
нужно объяснить связь этого списка с позициями значений во второй строке.

Существующий компилятор уже обрабатывает несколько строк. Сначала проверяем его поведение через builder;
не добавляем новую реализацию INSERT или дополнительную проверку без обнаруженного пробела.

## Completion criteria for the current task

- INSERT двух строк формирует один SQL-запрос; точные SQL и параметры подтверждены через `compile(query.toIR(), dialect)`.
- Разный порядок ключей объектов с одинаковым набором колонок не меняет привязку значений к колонкам.
- Исполнение допустимого запроса на реальном драйвере подтверждает содержимое обеих вставленных строк.
- Несовпадающие наборы колонок отклоняются до вызова драйвера с точной ошибкой; случай не должен обходить типы через
  небезопасное приведение. Для примера можно использовать необязательную колонку.
- Пользователь объясняет связь списка колонок INSERT с позициями значений каждого кортежа VALUES.
- Узкие тесты и `pnpm check-types` проходят.

## Evidence from repository

- `src/query/write-builders.ts`: `values` использует существующий `insert`; `toIR` предоставляет готовый `Insert<R>`.
- `src/compiler/compiler.ts:194–241`: `compileInsert` берёт `Object.keys` первой строки, проверяет одинаковый набор
  колонок через длину и `Object.hasOwn`, затем читает каждую строку по именам колонок первой строки.
- Формулировка roadmap про ordered column set требует уточнения: одинаковым должен быть порядок значений относительно
  общего SQL-списка колонок, а не порядок перечисления ключей каждого входного объекта.
- При несовпадении набора колонок `compileInsert` выбрасывает обычный `Error`; это не типизированный `DriverError`.
- `InferInsert<T>` делает необязательными колонки с `_pk: true` или `_hasDefault: true`.
- Effect установлен в версии `4.0.0-rc.108`, Vitest — `4.1.11`.
- После L3.24: `pnpm check-types` — код `0`;
  `pnpm test src/query/write-builder.test.ts src/query/builder.test.ts` — девять тестов прошли.

## Teaching mode

Backend mentoring remains active:

1. one high-signal prediction;
2. smallest user-authored change;
3. narrow type/runtime check;
4. short explanation in the user's words;
5. next step only after the current invariant is observed.

Рабочие правила и открытые долги — в [NOTES.md](NOTES.md). Do not front-load Repository, transactions, relations or
write builders.

## Next implementation boundary

Упражнение E3.3 разложено на L3.24–L3.28: INSERT FSM, multi-row invariants, variadic `returning`, UPDATE FSM,
DELETE FSM. L3.23 (`executeStream` на `ExecutableQuery`) относится к упражнению E3.7 курса и отложен по просьбе
пользователя; это долг, а не пропуск prerequisite — write-builder от streaming не зависит. Пропущенные L3.18 и L3.19
остаются долгом и закрываются тестом на join во время исполнения.

## Open uncertainties

- Тестов на join во время исполнения нет; вся проверка join — на уровне типов.
- Обоснование политики повторного alias пользователем не сформулировано.
- Смысл `exactOptionalPropertyTypes` самостоятельно не объяснён.
- Непроверенное приведение `raw.rows as ... StatementResult<S>` в `typed-run.ts`; runtime schema validation
  отсутствует.
- Смысл поля `count` в `TooManyError` не зафиксирован; имя `executeOneOrThrow` сохранено из курса, хотя исключение не
  выбрасывается.
- `libsql.executeStream` возвращает `Stream.empty`; capability выглядит реализованной, но является no-op.
