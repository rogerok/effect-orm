# Session

## Intent

Урок 3 курса пройден до упражнений. Текущая цель — упражнение E3.1: `selectAll()` только для запроса без join.

## Current phase

Builder урока 3 собран: FSM из двух классов, SourceMap, `where`/`orderBy`/`limit`/`offset`, projection, три terminals,
`innerJoin` и `leftJoin`. История шагов и подтверждения — в [записях](records/index.md), таблица в
[progress.md](progress.md).

## Current task

**E3.1 (roadmap L3.13): `selectAll()` на `SelectQueryBuilder`, доступный только при единственном источнике.**

Новая механика шага — `this` parameter: тип получателя проверяется в месте вызова, поэтому метод можно объявить в
классе, но сделать недоступным для части его экземпляров.

Подсказка курса: маркер `__singleSource: true`, который ставит `selectFrom` и убирают `innerJoin`/`leftJoin`.
Допустима и проверка через `keyof S`; выбор за пользователем, но он должен объяснить, что именно делает ограничение.

Готовые опоры в проекте: `Projection` в `src/compiler/ir.ts` уже допускает `'*'`, компилятор эту ветку печатает
(`src/compiler/compiler.ts:103`), `InferRow<T>` в `src/schema/infer.ts:18` даёт тип строки таблицы.

## Completion criteria for the current task

- `selectFrom(users, 'u').selectAll()` компилируется в `SELECT * FROM "users" AS "u"`.
- Тип результата совпадает с `InferRow` таблицы, а не с `unknown` или `Record<string, unknown>`.
- После `innerJoin` или `leftJoin` вызов `selectAll()` не компилируется; negative case закреплён `@ts-expect-error`.
- Пользователь объясняет своими словами, почему ограничение выражено типом получателя, а не проверкой во время
  исполнения.

## Evidence from repository

- `src/query/builder.ts` содержит `innerJoin` (с doc comment) и `leftJoin`; обе возвращают
  `SelectQueryBuilder<{ [K in A]: T } & S>`.
- `pnpm check-types` — exit code 0.
- LEFT JOIN проверен на SQLite: 4 строки, у пользователя без постов `postTitle: null` при типе `string`. Запись 0038.
- Тестов на join в репозитории нет; все проверки выполнялись временными скриптами и удалены.

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

После E3.1 — E3.2 курса, он же L3.20–L3.22: nullability источника после LEFT JOIN. Пропущенные L3.18 и L3.19 остаются
долгом и закрываются тестом на join.

## Open uncertainties

- Тип результата после `leftJoin` не выражает `null`.
- Обоснование политики повторного alias пользователем не сформулировано.
- Смысл `exactOptionalPropertyTypes` самостоятельно не объяснён.
- Непроверенное приведение `raw.rows as ... StatementResult<S>` в `typed-run.ts`; runtime schema validation
  отсутствует.
- Смысл поля `count` в `TooManyError` не зафиксирован; имя `executeOneOrThrow` сохранено из курса, хотя исключение не
  выбрасывается.
- `libsql.executeStream` возвращает `Stream.empty`; capability выглядит реализованной, но является no-op.
