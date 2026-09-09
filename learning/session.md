# Session

## Intent

Урок 3 курса пройден до упражнений. Идёт упражнение E3.2 курса: nullability источника после LEFT JOIN.

## Current phase

Builder урока 3 собран: FSM из двух классов, `SourceMap`, `where`/`orderBy`/`limit`/`offset`, projection, три
terminals, `innerJoin` и `leftJoin`. `SourceMap` переведён на `Source<T, N>` с признаком nullability. История шагов и
подтверждения — в [записях](records/index.md), таблица в [progress.md](progress.md).

## Current task

**L3.22: протянуть nullability источника в возвращаемый тип `col`.**

L3.21 закрыт и проверен, [запись 0040](records/0040-l3-21-source-nullability-metadata.md).

Условный тип в `col` пользователь уже написал:

```ts
) => Expr<
  S[A]['nullable'] extends true
    ? InferColumn<S[A]['table']['_columns'][C]> | null
    : InferColumn<S[A]['table']['_columns'][C]>
>;
```

Он компилируется, но его поведение не наблюдалось. Не хватает двух вещей: утверждений на возвращаемый тип `col` для
inner и left источников и реальной несовпавшей строки, где значение совпадает с типом.

## Completion criteria for the current task

- `col` для источника из LEFT JOIN даёт `Expr<T | null>`, для остальных источников тип не меняется; оба случая
  подтверждены `expectTypeOf` и мутационной проверкой.
- Объявленная nullable колонка из non-nullable источника не получает второй `null` и не ломается.
- Реальный запрос с LEFT JOIN на SQLite: там, где тип допускает `null`, приходит `null`, и наоборот.
- Существующие вызовы билдера продолжают компилироваться; `pnpm test src/query/builder.test.ts` остаётся зелёным.

## Evidence from repository

- `SourceMap = Record<string, Source<AnyTableDef, boolean>>` в `src/query/expression-builder.ts`; `AnyTableDef` вынесен
  в `src/schema/table.ts` и заменил повторяющееся написание в `expressions.ts` и `statements.ts`.
- `selectFrom` и `innerJoin` возвращают `Source<T, false>`, `leftJoin` — `Source<T, true>`; внутри `on` у `leftJoin`
  источник помечен `false`.
- `pnpm check-types` — exit code 0. `pnpm test src/query/builder.test.ts` — 7 passed.
- `src/hw/e3-2.test.ts`: `SourceOf<Q>` через `infer`, три утверждения `toEqualTypeOf` на `['nullable']`, обращения
  `b.col` к присоединяемому alias внутри обоих `on`.
- Мутация `Source<T, true>` → `Source<T, false>` в `leftJoin` даёт ровно одну ошибку `TS2344` на строке 33, то есть
  утверждение про `'c'` действительно проверяет флаг.
- `pnpm lint` — три предупреждения о неиспользуемых импортах `ColumnDef`, `SqlType`, `TableDef` в
  `src/query/expression-builder.ts`.
- `pnpm format:check` по `src/` чистый; предупреждения относятся только к `learning/references/*.html`.

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

После L3.22 упражнение E3.2 закрыто. Дальше по roadmap — L3.23 (`executeStream` на `ExecutableQuery`), затем write
builder L3.24–L3.28. Пропущенные L3.18 и L3.19 остаются долгом и закрываются тестом на join во время исполнения.

## Open uncertainties

- Поведение `col` для declared nullable колонки из non-nullable источника не проверено: два источника `null` могут
  дать `T | null | null` или потерять один из них.
- Тестов на join во время исполнения нет; вся проверка join — на уровне типов.
- Обоснование политики повторного alias пользователем не сформулировано.
- Смысл `exactOptionalPropertyTypes` самостоятельно не объяснён.
- Непроверенное приведение `raw.rows as ... StatementResult<S>` в `typed-run.ts`; runtime schema validation
  отсутствует.
- Смысл поля `count` в `TooManyError` не зафиксирован; имя `executeOneOrThrow` сохранено из курса, хотя исключение не
  выбрасывается.
- `libsql.executeStream` возвращает `Stream.empty`; capability выглядит реализованной, но является no-op.
