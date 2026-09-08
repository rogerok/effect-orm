# Mission: вход в урок 3 — Phantom-typed Builder

## Why

Построить fluent API поверх уже работающего typed AST, не создавая второй compiler и не смешивая query construction с
I/O. Практическая проблема текущего кода: single-table запросы собираются через функции и options-объекты, а
существующий JoinIR ещё не даёт безопасного API для aliases и joined columns.

## Success looks like

- Восстановить путь `schema → typed wrapper → runtime IR → compiler → Driver` и разделить runtime state, type-only state
  и Effect environment.
- Спроектировать FSM через `SelectQueryBuilder<S>` и `ExecutableQuery<R>` с разными наборами доступных методов.
- Сохранить alias literal в `SourceMap` и вывести допустимые column references из `TableDef`.
- Реализовать минимальный immutable single-table SELECT до перехода к join.
- Добавить INNER JOIN так, чтобы ON/projection видели только зарегистрированные aliases и их реальные columns.
- Получить точный result type из projection object.
- Подключить execution через существующий typed run/stream pipeline, а не копировать compiler/Driver logic.
- Объяснить каждую внутреннюю type assertion через поддерживаемый runtime invariant.

## Constraints

- Backend-код и backend-тесты пишет пользователь; наставник диагностирует модель, даёт минимальный следующий шаг и
  проверяет observable result.
- Один шаг — одна новая причинная связь или один небольшой API transition.
- Builder остаётся front-end к существующему `SelectIR`; compiler и dialect layer не дублируются.
- Сначала single-table query, затем INNER JOIN, затем LEFT JOIN nullability.
- Repository, write builder, transactions, relations и migrations не входят в первый vertical slice.
- Наличие сложного generic в коде не считается mastery без самостоятельного объяснения и negative type case.

## Current step

Упражнение E3.1 курса, оно же L3.13 из [roadmap](roadmap.md): `selectAll()` разрешён только при единственном источнике.

`innerJoin` и `leftJoin` реализованы и проверены на SQLite. Открытый долг — тип результата после `leftJoin` ещё не
выражает `null` ([запись 0038](records/0038-l3-left-join-runtime-null.md)); это упражнение E3.2 курса.

`innerJoin` реализован и проверен: SourceMap растёт через пересечение, `on` видит обе стороны, IR содержит один `Join`,
SQL и строки на SQLite совпадают с ожидаемыми. Подробности в [записи 0036](records/0036-l3-14-inner-join-source-extension.md).
