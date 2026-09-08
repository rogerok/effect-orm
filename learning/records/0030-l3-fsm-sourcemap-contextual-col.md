# 0030 — L3.1–L3.3: FSM, SourceMap и contextual col подтверждены

## Контекст

Начало урока 3: переход от functional typed query constructors к fluent builder без дублирования compiler и Driver pipeline.

## Наблюдения

- Пользователь классифицировал valid/invalid chains для `SelectQueryBuilder<S>` и `ExecutableQuery<R>` и реализовал compile-only поверхности двух состояний.
- `@ts-expect-error` и `pnpm check-types` подтвердили отсутствие `execute` до `select` и отсутствие `where` после `select`.
- `selectFrom(users, 'u')` сохраняет generic `A = 'u'`; mapped type `{ [K in A]: T }` выводит `{ u: typeof users }` без widening до `SourceMap`.
- Negative cases подтвердили запрет неизвестного alias и неизвестной column.
- Пользователь различил generic constraint и widening после контрпримера: `A extends string` разрешает сохранить литеральный subtype `'u'`, а не заменяет его на `string`.
- `ExpressionBuilder<S>.col` связывает `A extends keyof S & string`, `C extends keyof S[A]['_columns'] & string` и `Expr<InferColumn<S[A]['_columns'][C]>>`.
- Runtime-фабрика без unsafe assertions создала существующий `Column` IR: `{"table":"u","_tag":"Column","name":"id"}`.
- При подключении production-модуля диагностирована разница между `SourceMap` и `SourceMap[string]`: первый — весь alias dictionary, второй — тип одной таблицы в нём.

## Проверка

- `pnpm check-types` завершился с exit code 0 после исправления constraints и подключения `makeExpressionBuilder<Sources>()`.
- Throwaway runtime-вызов `makeExpressionBuilder<{ u: typeof users }>().col('u', 'id')` вернул точный `Column` IR.

## Итог

L3.1–L3.3 закрыты. Type-state FSM, single-source environment и contextual column reference подтверждены отдельно на type-level и runtime. Следующий шаг — L3.4: переиспользовать существующие `lit`, `eq` и `and` constructors через `ExpressionBuilder`.
