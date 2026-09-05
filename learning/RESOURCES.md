# Effect ORM Learning Resources

## Knowledge

- Course: `~/Documents/bat-school/orm/BatSchool · Своя ORM на TypeScript + Effect.ts.html`
  Основной материал курса. Для текущей миссии использовать раздел 2.9 и упражнение E2.6; разделы 2.1–2.6 остаются опорой для IR, `isIn`, typed `select` и `run`.
- [Current IR](../src/compiler/ir.ts), [constructors](../src/compiler/ir-constructors.ts), [compiler](../src/compiler/compiler.ts) и [run helper](../src/compiler/run.ts)
  Текущее состояние практической реализации. Использовать для чтения кода и проверки объяснений, но не как текст для копирования в упражнениях на воспроизведение.
- [TypeScript Handbook: Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
  Официальная модель размеченных объединений и исчерпывающего разбора вариантов. Использовать для устройства AST и проверки добавления нового `_tag`.
- [TypeScript Handbook: Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html#hello-world-of-generics)
  Для диагностики E2.4: как параметр типа сохраняет информацию и связывает аргументы типизированного конструктора. Не считать наличие `Expr<T>` в проекте доказательством освоения этой связи.
- [TypeScript Handbook: Type Compatibility → Generics](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#generics)
  Главный источник урока 0009: параметр типа влияет на совместимость только через структуру, в которой используется. Примеры Empty<T> и NotEmpty<T> объясняют роль фантомного маркера.
- [TypeScript Handbook: Erased Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types)
  Различие проверки типов и исполнения JavaScript: аннотации не становятся runtime-проверками.
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
  Первичный источник для поведения `=`, `NULL` и `IS [NOT] DISTINCT FROM`. Для E2.4 — включённые границы `BETWEEN`, порядок границ и сопоставимость операндов.
- [Effect 4.0.0-rc.108: `Effect.cached`](https://unpkg.com/effect@4.0.0-rc.108/src/Effect.ts)
  Для E2.5: раздел Caching, создание ленивого кешированного эффекта и повторное использование результата. `cached` не принимает ключ IR; поиск записи по ключу — отдельная ответственность.
- [Effect 4.0.0-rc.108: `Hash`](https://unpkg.com/effect@4.0.0-rc.108/src/Hash.ts)
  Для E2.5: структурное хеширование объектов и массивов в установленной версии; результат хеша кешируется по объекту. Не переносить предположения о поведении Effect 3. Совпадение хешей само по себе не доказывает равенство значений.
- [Effect 4.0.0-rc.108: `HashMap`](https://unpkg.com/effect@4.0.0-rc.108/src/HashMap.ts) и [Equal](https://unpkg.com/effect@4.0.0-rc.108/src/Equal.ts)
  Для поиска кешированных эффектов по IR: HashMap использует хеширование и структурное равенство ключей. В этой версии обычные объекты сравниваются по содержимому. HashMap неизменяемый; Hash и Equal кешируют результаты, поэтому использованные ключи нельзя мутировать.
- [Effect 4.0.0-rc.108: `Request`](https://unpkg.com/effect@4.0.0-rc.108/src/Request.ts)
  Первичный источник для E2.6: параметры `Request<A, E, R>`, порядок generic-параметров `Request.TaggedClass` и контракт `Request.Entry`, включая `request`, `context` и завершение entry.
- [Effect 4.0.0-rc.108: `RequestResolver`](https://unpkg.com/effect@4.0.0-rc.108/src/RequestResolver.ts)
  Публичный контракт батч-резолвера. `make` получает непустой набор entry; успешное завершение резолвера с незавершённым entry считается дефектом.
- [Effect 4.0.0-rc.108: реализация request batching](https://unpkg.com/effect@4.0.0-rc.108/src/internal/request.ts)
  Источник точной механики установленной RC: entry группируются по экземпляру resolver и batch key, запуск откладывается на `resolver.delay`, а `RequestResolver.make` использует `Effect.yieldNow`. Здесь нет автоматической дедупликации или кеша одинаковых request-значений.

## Wisdom (Communities)

- [Effect Discord](https://discord.gg/effect-ts)
  Официальное сообщество. Использовать для проверки тонкостей Effect 4 RC на минимальном примере, если исходник и типы пакета не дают однозначного ответа.

## Gaps

- Для архитектурного термина Free/AST в рамках 2.1–2.5 пока используется определение курса; отдельный первичный источник понадобится только при обнаруженном пробеле в этой модели.
