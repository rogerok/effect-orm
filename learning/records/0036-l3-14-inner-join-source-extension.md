# 0036 — L3.14/L3.16/L3.17: `innerJoin` расширяет SourceMap и создаёт JoinIR

## Контекст

`SelectQueryBuilder<S>` работал с одним источником. Шаги roadmap L3.14, L3.16 и L3.17 требуют трёх разных вещей: тип
результата метода добавляет новый alias в SourceMap, callback `on` получает уже расширенный контекст, а runtime-часть
добавляет один элемент `Join` в существующий IR без изменения компилятора.

До этой сессии в `src/query/builder.ts` была написана сигнатура `innerJoin` и создание `eb`, тела не было.
`pnpm check-types` давал ровно одну ошибку TS2355.

## Результат

Реализация пользователя:

```ts
const eb = makeExpressionBuilder<{ [K in A]: T } & S>();
const onPred = on(eb);

return new SelectQueryBuilder<{ [K in A]: T } & S>({
  ...this.state,
  joins: [
    ...this.state.joins,
    { kind: 'inner', table: table._name, alias, on: onPred },
  ],
});
```

Три связи, которые задают поведение:

1. Возвращаемый тип `{ [K in A]: T } & S` сохраняет прежние источники и добавляет новый; пересечение типов здесь
   выполняет ту же роль, что добавление записи в словарь.
2. `makeExpressionBuilder` создаётся с тем же расширенным параметром, поэтому внутри `on` доступны обе стороны:
   `b.col('u', 'id')` и `b.col('p', 'userId')`.
3. В `Join` физическое имя таблицы и alias — разные поля. Компилятор из них строит `INNER JOIN "posts" AS "p"`, поэтому
   в `on` ссылки идут на alias, а не на имя таблицы.

Приведение типа не потребовалось: `Pred` — это `Predicate` с необязательным брендом, и присваивается напрямую.

## Проверка

`pnpm check-types` — exit code 0. Временный скрипт `src/hw/tmp-join-check.ts` создавался, запускался командой
`node --conditions=development --import tsx` и удалён после прогона.

IR одного join:

```json
{
  "kind": "inner",
  "table": "posts",
  "alias": "p",
  "on": {
    "_tag": "Eq",
    "left": { "table": "u", "_tag": "Column", "name": "id" },
    "right": { "table": "p", "_tag": "Column", "name": "userId" }
  }
}
```

Скомпилированный SQL для SQLite:

```sql
SELECT "p"."title" AS "postTitle", "u"."id" AS "userId", "u"."name" AS "userName"
FROM "users" AS "u"
INNER JOIN "posts" AS "p" ON "u"."id" = "p"."userId"
WHERE "p"."id" > ?
```

Параметры `[0]`. Компилятор не изменялся: ветка join существовала в `src/compiler/compiler.ts:128`.

Неизменяемость подтверждена наблюдением: после построения join исходный builder скомпилировался в
`SELECT "u"."id" AS "userId" FROM "users" AS "u"` — без JOIN. Один источник остаётся одним источником.

Два negative type case прошли через `@ts-expect-error` и `pnpm check-types`, то есть оба вызова действительно являются
ошибками компиляции:

- `b.col('p', 'id')` в `where` builder-а **до** join: alias `p` ещё не зарегистрирован;
- `b.col('p', 'nope')` внутри `on`: колонки `nope` нет в `posts`.

Сквозной прогон на реальном SQLite через `Driver` и `execute()` вернул:

```text
[ { postTitle: 'a1', userId: 1, userName: 'Ann' },
  { postTitle: 'a2', userId: 1, userName: 'Ann' } ]
```

Данные: `users` (1 Ann, 2 Bob, 3 Cid), `posts` (10 → 1, 11 → 1, 12 → 99). Результат совпал с прямым SQL-прогоном тех же
таблиц.

## Семантика SQL INNER JOIN подтверждена прогнозом

Перед реализацией INNER JOIN был показан на наблюдаемых данных: `CROSS JOIN` тех же таблиц даёт 9 пар, условие
`u.id = p.user_id` оставляет 2. Отсюда два следствия: одна строка левой таблицы даёт столько строк результата, сколько
строк правой прошли ON; строка без совпадения удаляется независимо от стороны.

Прогноз пользователя на изменённых данных (добавлен пост `13` с `user_id = 2`): три строки, потому что подходящих
`user_id` в `posts` теперь два — `1` с двумя постами и `2` с одним. Наблюдение совпало:

```text
[ { postTitle: 'a1', userId: 1, userName: 'Ann' },
  { postTitle: 'a2', userId: 1, userName: 'Ann' },
  { postTitle: 'b1', userId: 2, userName: 'Bob' } ]
```

`orphan` (`user_id = 99`) в результат не попал, `Cid` без постов тоже. Оба следствия названы без подсказки, поэтому
уровень `SQL JOIN и aliases` поднят с `unknown` до 2.

## Итог

L3.14, L3.16 и L3.17 закрыты по observable contract. Реализация выполнена пользователем по списку ограничений, без
показанного кода.

Долги: тестов на join в репозитории нет, вся проверка была временным скриптом; L3.15 (повторный alias) не рассмотрен,
и сейчас пересечение с существующим ключом происходит молча.
