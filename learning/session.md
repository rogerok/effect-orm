# Session

## Intent

Урок 3 курса пройден до упражнений. Текущая цель — упражнение E3.1: `selectAll()` только для запроса без join.

## Current phase

Builder урока 3 собран: FSM из двух классов, SourceMap, `where`/`orderBy`/`limit`/`offset`, projection, три terminals,
`innerJoin` и `leftJoin`. История шагов и подтверждения — в [записях](records/index.md), таблица в
[progress.md](progress.md).

## Current task

**E3.2 курса (roadmap L3.20–L3.22): nullability источника после LEFT JOIN.**

E3.1 закрыт и проверен, [запись 0039](records/0039-e3-1-select-all-single-source.md). Незакрытый долг того шага:
проверочных случаев для `selectAll` в репозитории нет, `src/hw/e3-2.ts` удалён.

Содержание нового шага по курсу: `SourceMap` перестаёт быть `Record<string, TableDef>` и становится
`Record<string, { table, nullable }>`; `selectFrom` и `innerJoin` ставят `nullable: false`, `leftJoin` —
`nullable: true`; `col` возвращает `Expr<T | null>` для nullable источника. Это правка типов, затрагивающая
`expression-builder.ts` и все методы билдера, поэтому её нужно разбить на шаги, а не делать одной правкой.

Первый наблюдаемый факт уже есть: после `leftJoin` строка `Cid` пришла с `postTitle: null` при типе `string`
([запись 0038](records/0038-l3-left-join-runtime-null.md)).

## Completion criteria for the current task

- `SourceMap` хранит признак nullability источника; `selectFrom`, `innerJoin` и `leftJoin` заполняют его правильно.
- `col` для источника из LEFT JOIN даёт `Expr<T | null>`, для остальных источников тип не меняется.
- Реальная строка без совпадения совпадает с типом: там, где тип допускает `null`, приходит `null`, и наоборот.
- Существующие вызовы билдера продолжают компилироваться.

## Evidence from repository

- `src/query/builder.ts` содержит `innerJoin` (с doc comment), `leftJoin` и `selectAll` с условным `this`.
- Рядом с классом объявлены `IsUnion` и `IsSingleSource`.
- `pnpm check-types` — exit code 0.
- LEFT JOIN проверен на SQLite: 4 строки, у пользователя без постов `postTitle: null` при типе `string`. Запись 0038.
- `selectAll` проверен: SQL `SELECT * FROM "users" AS "u"`, реальные строки, отклонение после обоих join. Запись 0039.
- `src/hw/e3-1.ts` содержит compile-only проверки `selectAll`: вызов после `innerJoin` под `@ts-expect-error` и обычный
  вызов. Мутация (удаление `.selectAll()`) даёт `TS2578`, то есть директива покрывает нужное ограничение.
- Не покрыты: вызов после `leftJoin`, вызов после модификатора, поведение join во время исполнения.
- `oxlint` выдаёт два предупреждения `no-unused-vars` на `src/hw/e3-1.ts`.

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
