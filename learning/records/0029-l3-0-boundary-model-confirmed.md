# 0029 — L3.0: граница runtime BuilderState ↔ type-only SourceMap подтверждена

## Контекст

Входная диагностика урока 3 (Phantom-typed Builder): классификация элементов цепочки
`SelectQueryBuilder<S> --select--> ExecutableQuery<R>` на runtime-данные, type-only и оба мира.

## Наблюдения

- Пользователь верно классифицировал `from.table` и `joins` как runtime-данные, `keyof S` и `R` — как
  type-only, `Driver` — как не-часть-состояния билдера (Environment, появляется только в `.execute()`).
- `from.alias` сначала отнесён к чистым runtime-данным. Уточнение через widened-alias прогноз: alias живёт
  дважды — строкой для SQL/Expr и литеральным типом `A extends string` как ключом SourceMap `{ [K in A]: T }`.
- Прогноз подтверждён: при `alias: string` SourceMap вырождается в `Record<string, T>`; опечатка
  `b.col("u2", "id")` компилируется, в SQL уходит `"u2"."id"`, ошибка приходит из БД в рантайме;
  автодополнение исчезает, потому что множество ключей `string` бесконечно.
- Изолированные зонды tsc проекта:
  - `{ [K in string]: T }` — индексная сигнатура, `keyof` = `string` (в отличие от plain index signature,
    где `keyof` = `string | number`).
  - `{ [K in "u" | "p"]: T }` — `keyof` = `"u" | "p"`.
  - Передача generic-параметра как значения даёт TS2693: `'S' only refers to a type, but is being used as
a value here`.
- Граница компилятора: в `compile` течёт только IR. `users` (TableDef) не проходит по контракту (`_tag`),
  а `_codec`-функции в `ColumnDef` несовместимы со структурным HashMap-ключом compile cache из E2.5.

## Итог

Модель «builder — front-end к IR; `S` и `R` — стираемые тени» подтверждена. L3.0 закрыт.
Следующий шаг — L3.1: допустимые/недопустимые цепочки FSM и compile-only поверхности двух классов.
