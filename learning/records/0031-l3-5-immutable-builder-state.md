# 0031 — L3.5: immutable Builder разделяет runtime и type-only state

## Контекст

Первый production-шаг fluent builder: создать `SelectQueryBuilder<S>` из `TableDef` и alias, не записывая type-level `SourceMap` в runtime state и не подключая compiler или Driver.

## Наблюдения

- Пользователь реализовал статическую границу создания `SelectQueryBuilder.__make` и фабрику `selectFrom(table, alias)`.
- Generic `A` сохраняет literal alias в `{ [K in A]: T }`; runtime state хранит только `from`, `joins`, `orderBy` и значения modifiers.
- Пользователь восстановил двойную роль alias: runtime-строка нужна будущему SQL, literal type ограничивает допустимые alias и колонки.
- Пользователь сформулировал инвариант persistent builder: общие ссылки допустимы, пока общие данные не мутируются; изменение массива должно создавать новый массив.
- `readonly` ограничивает операции на уровне TypeScript, но не выполняет runtime freeze и само не реализует copy-on-write.

## Проверка

- `pnpm check-types` завершился с exit code 0.
- Runtime-вызов `selectFrom(users, "u")` создал `{"from":{"table":"users","alias":"u"},"joins":[],"orderBy":[]}`.
- Ветвление общего prefix через `limit(10)` и `limit(20)` сохранило исходный builder без `limit` и создало две ветки с независимыми значениями.

## Итог

L3.5 закрыт на уровне самостоятельной реализации с помощью и объяснения runtime/type-only границы. Следующий шаг — заранее определить observable семантику повторного `where`, затем реализовать её через существующий `Predicate` AST.
