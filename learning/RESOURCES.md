# Free/AST Query Pipeline Resources

## Knowledge

- Course: `~/Documents/bat-school/orm/BatSchool · Своя ORM на TypeScript + Effect.ts.html`
  Основной материал миссии. Использовать только разделы 2.1–2.5: алгебра, чистый AST, untyped smart constructors, fold-компилятор и Effect-helper.
- [Current IR](../src/compiler/ir.ts), [constructors](../src/compiler/ir-constructors.ts), [compiler](../src/compiler/compiler.ts) и [run helper](../src/compiler/run.ts)
  Текущее состояние практической реализации. Использовать для чтения кода и проверки объяснений, но не как текст для копирования в упражнениях на воспроизведение.
- [TypeScript Handbook: Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
  Официальная модель размеченных объединений и исчерпывающего разбора вариантов. Использовать для устройства AST и проверки добавления нового `_tag`.
- [Effect v4: Using generators](https://www.effect.website/docs/v4/getting-started/using-generators)
  Официальное объяснение `Effect.gen`, `yield*`, распространения успеха и ошибки. Использовать для чтения `run`.
- [Effect v4: Services](https://www.effect.website/docs/v4/requirements-management/services)
  Официальная модель сервисов в `Context`, извлечения зависимости и предоставления реализации. Использовать для понимания требования `Driver` в типе `Effect`.
- [Source: `Match.ts` — Effect 4.0.0-rc.108](https://unpkg.com/effect@4.0.0-rc.108/src/Match.ts)
  Точный исходник установленной версии механизма сопоставления с образцом (pattern matching). Использовать для поведения `Match.tag` и `Match.exhaustive`, где RC API может отличаться от стабильной документации.
- [ECMAScript: IsStrictlyEqual](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-isstrictlyequal)
  Нормативный алгоритм оператора `===`. Использовать для точной границы constant folding и контрпримеров с разными типами, `NaN` и объектами.
- [PostgreSQL: Logical Operators](https://www.postgresql.org/docs/current/functions-logical.html)
  Первичный источник для трёхзначной SQL-логики и проверки законов `AND`, `OR`, `NOT`. Использовать при оценке семантической корректности optimizer rules.
- [PostgreSQL: Comparison Functions and Operators](https://www.postgresql.org/docs/current/functions-comparison.html)
  Первичный источник для поведения `=`, `NULL` и `IS [NOT] DISTINCT FROM`. Использовать перед constant folding сравнений литералов.

## Wisdom (Communities)

- [Effect Discord](https://discord.gg/effect-ts)
  Официальное сообщество. Использовать для проверки тонкостей Effect 4 RC на минимальном примере, если исходник и типы пакета не дают однозначного ответа.

## Gaps

- Для архитектурного термина Free/AST в рамках 2.1–2.5 пока используется определение курса; отдельный первичный источник понадобится только при обнаруженном пробеле в этой модели.
