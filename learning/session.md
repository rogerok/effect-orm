# Session

## Intent

Продолжить урок 3 курса: Phantom-typed Builder. L3.9 завершён: `select(callback)` создаёт typed AST, а compiler
выдаёт SQL aliases и параметры. Пользователь связал имя поля результата с ключом selection, а тип — с выражением.

## Current phase

Фаза 0 curriculum: отделение законченного запроса от builder.

## Current task

**L3.10 — отделить `ExecutableQuery<R>`.**

Ожидаемый учебный результат текущего шага:

- `select` возвращает второй класс, хранящий существующий `Select<R>`;
- `toIR()` возвращает typed `Select<R>`;
- результат `select` не предоставляет `where`, `orderBy`, `limit`, `offset` и повторный `select`;
- runtime IR и тип строки сохраняются при изменении поверхности API.

## Evidence from repository

- `src/query/builder.ts` содержит подтверждённые `BuilderState`, `SelectQueryBuilder<S>` и `selectFrom(table, alias)`.
- Начальный runtime state: `from`, пустые `joins` и `orderBy`; runtime-поля для `SourceMap` нет.
- `limit` создаёт новый builder: проверка общего prefix вернула независимые `limit = 10` и `limit = 20`, исходный
  builder остался без `limit`.
- Пользователь объяснил двойную роль alias и инвариант structural sharing: общие ссылки допустимы, пока данные не
  мутируются; изменение массива требует нового массива.
- `src/compiler/ir.ts` задаёт `SelectIR.where?: Predicate`, а `src/query/expression-builder.ts` уже создаёт совместимые
  predicates.
- `pnpm check-types` завершился с exit code 0.

## Teaching mode

Backend mentoring remains active:

1. one high-signal prediction;
2. smallest user-authored change;
3. narrow type/runtime check;
4. short explanation in the user's words;
5. next step only after the current invariant is observed.

Do not paste a complete builder implementation. Do not front-load Repository, transactions, relations or write builders.

## First diagnostic prompt for the next learning turn

Восстановить compile-only FSM из `src/hw/e3-1.ts`: `R` описывает строку результата, а доступные методы определяются
классом возвращённого объекта. Не повторять уже подтверждённую связь имени поля и типа выражения.

## Next implementation boundary

Следующая пользовательская реализация — минимальный `ExecutableQuery<R>` с хранением `Select<R>` и методом `toIR`.
`select(callback)` должен возвращать этот объект вместо raw typed AST. Перед заданием проверить текущие callers и
существующую FSM. Terminal execution подключается через существующий `run` в L3.11; не добавлять заглушки terminals.

## Completion criteria for the current task

- Тип результата `select` — `ExecutableQuery<RowFromSelection<Sel>>`.
- `toIR` возвращает `Select<R>` без потери типа результата.
- Negative type cases отвергают modifiers и повторный `select` на законченном запросе.
- Compiler получает прежний IR через `toIR()` и выдаёт прежние SQL и params.

- L3.8 проверен через `typescript/unstable/sync` с виртуальным содержимым файла: точное равенство
  `{ active: boolean; nickname: string | null }`, допустимость string/null и изолированная ошибка string в `active`.
  Репозиторий не менялся. Учебный пример с двумя ошибками оставлен по просьбе пользователя и не считается
  самостоятельным доказательством запрета string в `active`.

- L3.9: runtime-проверка публичного результата подтвердила `AS` aliases, порядок params, один вызов callback и
  независимость projection от соседней ветки. Виртуальный зонд TypeScript 7 подтвердил точный тип результата и запрет
  неизвестных alias, колонок и значений без `Expr`. `pnpm check-types` и узкий lint прошли.
- Пользователь предсказал `SELECT u.name AS id`, затем верно назвал тип `id` — `string`. L3.9 завершён с помощью;
  уровень самостоятельности не повышен.

## Open uncertainties

- L3.6: runtime-зонд собрал `SelectIR` из внутреннего state и передал существующему compiler; два `where` дали
  `WHERE ("u"."id" > $1) AND ("u"."name" = $2)` с params `[10, "Ann"]`. Соседняя ветка с `bool(false)` сохранила
  первый predicate и скомпилировала `AND (FALSE)`; исходные builder не изменились. База данных не вызывалась.
- Опечатка в `src/hw/e3-1.ts` устранена: повторный `pnpm check-types` завершился с exit code 0.
- L3.7: `orderBy` прошёл runtime-проверку через compiler. Последовательные вызовы сохранили
  `ORDER BY "u"."name" ASC, "u"."id" DESC`; sibling branch получила `id ASC`, а prefix и первая ветка остались
  неизменными. `WHERE`, params `[10]`, `LIMIT 20` и `OFFSET 5` сохранились во всех ветках.
- `pnpm check-types` прошёл после добавления `orderBy`. Неиспользуемый импорт `Expr` удалён пользователем;
  повторный `pnpm exec oxlint src/query/builder.ts` прошёл без предупреждений. Проверка сортировки выполнялась без БД.
- Повторные modifiers проверены: `base` сохранил `LIMIT 10 OFFSET 5`, `base.limit(3)` сохранил `OFFSET 5`,
  следующая `.offset(0)` дала `LIMIT 3 OFFSET 0`. Отдельная ветка `.limit(0)` дала `LIMIT 0 OFFSET 5`.
  `WHERE`, `orderBy` и params `[1]` сохранились; проверки прошли без БД.
- Пользователь верно предсказал значения `page` и замену полей. Терминология уточнена: object spread создаёт новый
  объект, не является destructuring и не перезаписывает поля исходного `state`.
- Публичного `toIR` пока нет: для проверки использовать узкий runtime-зонд без преждевременного добавления execution.
- JOIN SQL semantics и aliases остаются непроверенными.
- Целевым продуктом пока остаётся ORM package: отдельное приложение-потребитель в репозитории отсутствует.
