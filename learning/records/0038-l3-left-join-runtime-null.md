# 0038 — `leftJoin` реализован; тип обещает `string`, SQL возвращает `null`

## Контекст

После `innerJoin` пользователь самостоятельно добавил `leftJoin` в `src/query/builder.ts`. Реализация повторяет
`innerJoin` и отличается одним полем: `kind: 'left'` вместо `kind: 'inner'`. Компилятор эту ветку уже поддерживал.

## Проверка

`pnpm check-types` — exit code 0.

SQL:

```sql
SELECT "p"."title" AS "postTitle", "u"."name" AS "userName"
FROM "users" AS "u"
LEFT JOIN "posts" AS "p" ON "u"."id" = "p"."userId"
```

Прогон на SQLite в памяти, данные: `users` (Ann, Bob, Cid), `posts` (`a1` → Ann, `a2` → Ann, `b1` → Bob,
`orphan` → несуществующий пользователь `99`):

```text
4 строки
{ postTitle: 'a1', userName: 'Ann' }
{ postTitle: 'a2', userName: 'Ann' }
{ postTitle: 'b1', userName: 'Bob' }
{ postTitle: null, userName: 'Cid' }
```

INNER JOIN на тех же данных возвращает 3 строки. Разница — строка `Cid`: у неё нет постов, поэтому LEFT JOIN сохраняет
её и заполняет колонки правой стороны значением `null`. `orphan` отсутствует в обоих вариантах: он относится к правой
стороне, которую LEFT JOIN не защищает.

## Наблюдаемый дефект типизации

Тип результата запроса — `{ postTitle: string; userName: string }`, а фактическое значение `postTitle` в четвёртой
строке равно `null`. Ошибки во время выполнения не возникает: runtime validation отсутствует, приведение в
`typed-run.ts` принимает любые строки драйвера.

Это ровно та задача, которую решают шаги L3.20–L3.22: nullable принадлежит **источнику**, а не колонке, поэтому после
`leftJoin` все колонки нового источника должны давать `Expr<T | null>`, тогда как у исходного источника тип не меняется.

## Семантика SQL, разобранная в том же шаге

Наблюдения на одних данных:

| запрос                                                   | строк |
| -------------------------------------------------------- | ----: |
| `users INNER JOIN posts ON u.id = p.user_id`             |     3 |
| `users LEFT JOIN posts ON u.id = p.user_id`              |     4 |
| `posts LEFT JOIN users ON u.id = p.user_id`              |     4 |
| `users LEFT JOIN posts ... WHERE p.title LIKE 'a%'`      |     2 |
| `users LEFT JOIN posts ... ON ... AND p.title LIKE 'a%'` |     4 |

Последние две строки таблицы фиксируют отдельный факт: условие на правую сторону в `WHERE` удаляет уже дополненные
`NULL` строки, поэтому LEFT JOIN ведёт себя как INNER JOIN. То же условие в `ON` участвует в сопоставлении, и
несовпавшие левые строки сохраняются.

## Итог

`leftJoin` работает на уровне SQL и runtime. На уровне типов результат пока неверен для колонок правой стороны; это
известный и записанный долг, а не незамеченный дефект.

Долг по тестам сохраняется: ни INNER, ни LEFT JOIN не защищены тестом в репозитории.
