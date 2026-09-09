# 0040 — L3.21: nullability как метаданные источника

## Контекст

Запись 0038 зафиксировала расхождение: после `leftJoin` реальная строка приходила с `postTitle: null`, а тип обещал
`string`. Упражнение E3.2 курса закрывает это расхождение. Шаг L3.21 — только метаданные: `SourceMap` начинает хранить
признак nullability каждого источника. Протягивание признака в возвращаемый тип `col` — отдельный шаг L3.22.

## Почему признак принадлежит источнику

`null` в результате появляется по двум независимым причинам.

1. Объявление колонки: `ColumnDef._nullable === true`. Это уже учитывал `InferColumn`.
2. Форма запроса: колонка объявлена NOT NULL, но LEFT JOIN не нашёл пару, и база подставила NULL во все колонки правой
   стороны.

Вторую причину нельзя записать в `ColumnDef`, потому что одна и та же `TableDef` в разных запросах занимает разные
позиции: в одном она источник из `selectFrom`, в другом — правая сторона LEFT JOIN. Позицию в запросе хранит
`SourceMap`, поэтому туда и добавляется признак. Признак относится к источнику целиком: при отсутствии совпадения NULL
приходит сразу во все колонки этой стороны.

## Результат

```ts
// src/schema/table.ts
export type AnyTableDef = TableDef<
  string,
  Record<string, ColumnDef<SqlType, boolean, boolean>>
>;

// src/query/expression-builder.ts
export type Source<T extends AnyTableDef, B extends boolean> = {
  nullable: B;
  table: T;
};

export type SourceMap = Record<string, Source<AnyTableDef, boolean>>;
```

Три производителя источников заполняют признак сами:

| метод        | источник наружу    | источник внутри `on` |
| ------------ | ------------------ | -------------------- |
| `selectFrom` | `Source<T, false>` | —                    |
| `innerJoin`  | `Source<T, false>` | `Source<T, false>`   |
| `leftJoin`   | `Source<T, true>`  | `Source<T, false>`   |

`col` в `ExpressionBuilder` получил условный тип и новый путь доступа
`S[A]['table']['_columns'][C]`. `selectAll` перешёл на `InferRow<S[keyof S]['table']>`.

`AnyTableDef` заменил повторяющееся написание `TableDef<string, Record<string, ColumnDef<SqlType, boolean, boolean>>>`
также в `expressions.ts` и `statements.ts`.

## Ключевое различие: граница типа и конкретный тип

`nullable: boolean` в `SourceMap` — правильно, потому что это граница (constraint): она обязана принимать источник с
любым флагом. Литералы `false` и `true` живут в возвращаемых типах трёх производителей; widening там не происходит,
потому что это аннотация типа, а не вывод типа из значения.

Проверено компилятором проекта (`typescript@7.0.2`) на изолированном примере:

- `{ nullable: boolean } extends { nullable: true }` даёт ветвь else. Причина — `boolean` это объединение
  `true | false`, и член `false` типу `true` не присваивается. Значения по умолчанию у `boolean` нет:
  `boolean extends false` тоже даёт else.
- Распределения по объединению здесь нет: проверяемый тип `S[A]['nullable']` — indexed access, а не голый параметр
  типа. Для голого параметра (`type Naked<T> = T extends true ? A : B`) при `T = boolean` результат был бы `A | B`.

## Семантика `ON` и флаг внутри callback

Внутри `on` присоединяемый источник помечен `false`, наружу `leftJoin` отдаёт `true`. Правило — про позицию предиката,
а не про join:

- `ON` фильтрует пары строк до подстановки NULL;
- `WHERE` фильтрует готовые строки после подстановки NULL.

LEFT JOIN гарантирует, что каждая строка левой таблицы попадёт в результат хотя бы один раз: если ни одна пара не
прошла `ON`, строка выдаётся с NULL во всех колонках правой стороны. Поэтому внутри `on` правая таблица — реальные
строки, NULL-расширения ещё не было.

Следствие, проверенное прогнозом пользователя на трёх пользователях, из которых двое имеют посты:

```sql
-- A: 3 строки (несовпавшие пользователи сохраняются, p.* = NULL)
SELECT u.name, p.title FROM users u
LEFT JOIN posts p ON p.userId = u.id AND p.title = 'нет такого';

-- B: 0 строк
SELECT u.name, p.title FROM users u
LEFT JOIN posts p ON p.userId = u.id
WHERE p.title = 'нет такого';
```

В B для несовпавшего пользователя вычисляется `NULL = 'нет такого'`, что даёт не ложь, а UNKNOWN; `WHERE` пропускает
только TRUE. Общее правило: условие в `WHERE` на колонку правой таблицы превращает LEFT JOIN в INNER JOIN. Исключение —
`IS NULL`.

## Проверка

`pnpm check-types` — exit code 0. `pnpm lint` — три предупреждения о неиспользуемых импортах в `expression-builder.ts`,
остатки рефакторинга. `pnpm test src/query/builder.test.ts` — 7 passed, то есть runtime-контракты terminals не задеты.

Наблюдаемая проверка шага — `src/hw/e3-2.test.ts`. Запрос `selectFrom(users, 'u').innerJoin(posts, 'p', ...)
.leftJoin(comments, 'c', ...)`, из его типа через `infer` извлекается `SourceMap`:

```ts
type SourceOf<Q> = Q extends SelectQueryBuilder<infer B> ? B : never;
```

Три утверждения на флаги: `'u'` и `'p'` равны `false`, `'c'` равен `true`. Матчер — `toEqualTypeOf`, он требует
точного совпадения и поэтому отклонил бы widening до `boolean`.

Обращения `b.col('p', 'userId')` и `b.col('c', 'postId')` внутри обоих `on` покрывают контекст callback.

Мутационная проверка: замена `Source<T, true>` на `Source<T, false>` в возвращаемом типе `leftJoin` даёт ровно одну
ошибку и ровно на нужном утверждении:

```text
src/hw/e3-2.test.ts:33:60 - error TS2344: Type 'true' does not satisfy the constraint
  '"Expected: literal boolean: true, Actual: literal boolean: false"'
```

## Практическая деталь запуска

В `vitest.config.ts` нет блока `typecheck`, поэтому `expectTypeOf` во время исполнения не делает ничего: `pnpm test`
для этого файла показывает passed при любых типах. Единственный гейт — `pnpm check-types`, который включает
`src/**/*.ts`.

Включение `typecheck` по умолчанию не помогло бы: `typecheck.include` в `vitest@4.1.11` равен
`['**/*.{test,spec}-d.?(c|m)[jt]s?(x)']`, то есть файл `e3-2.test.ts` под шаблон не подпадает.

## Что потребовало разбора

Форма `SourceMap` исправлялась четыре раза, каждый раз по одной причине.

1. `SourceMap<N extends boolean = false>` — один параметр на всю карту. Контрпример: запросу
   `selectFrom(users, 'u').leftJoin(posts, 'p', ...)` нужна карта, где `u` имеет `false`, а `p` имеет `true`; при одном
   общем `N` такой карты не существует ни при каком значении.
2. `selectFrom` остался на `T extends SourceMap[string]`. Indexed access в изменяемый тип — скрытая зависимость: имя не
   изменилось, а смысл ограничения молча стал «пара» вместо «таблица». Тело функции было подстроено под изменившееся
   ограничение (`table.table._name`) вместо исправления самого ограничения.
3. В `innerJoin` и `leftJoin` возвращаемый тип был переведён на пару, а параметр `on` и аргумент
   `makeExpressionBuilder` остались на `{ [K in A]: T } & S`. `pnpm check-types` молчал: ограничение
   `ExpressionBuilder<S extends SourceMap>` выполнялось за счёт index signature у `S`. Ошибка появлялась только на
   конкретном alias в месте вызова — `TS2345: Argument of type '"userId"' is not assignable to parameter of type
'never'`, потому что у `TableDef` нет свойства `table` и `keyof ... & string` схлопывался в `never`.
4. `SourceMap = Source<AnyTableDef, boolean>` без обёртки `Record<string, ...>` — тип стал описывать один источник
   вместо карты. Диагностический приём: при `TS2536` («ключ нельзя использовать для индексации типа X») разворачивать
   `X` по цепочке объявлений, а не править код в месте ошибки.

Семантику флага внутри `on` пользователь выбрал верно, но назвал решение принятым по ощущениям; правило про позицию
предиката сформулировано наставником и подтверждено прогнозом пользователя на двух запросах выше.

## Не покрыто

- L3.22 не проверен: условный тип в `col` написан, но утверждения на возвращаемый тип `col` для inner и left случаев
  отсутствуют, реальная несовпавшая строка после правки типов не наблюдалась.
- Тестов на join во время исполнения по-прежнему нет; `src/hw/e3-2.test.ts` проверяет только типы.
