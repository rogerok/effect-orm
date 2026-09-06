# Mistakes and debugging patterns

Это журнал только наблюдавшихся ошибок и исправленных ментальных моделей. Он не приписывает пользователю ошибки по одному лишь наличию проблемного кода.

## M1. `_tag` был принят за носитель value type

- **Наблюдение:** при разборе `Expr<number>` против `Expr<string>` причина несовместимости сначала связывалась с `_tag`.
- **Причина:** смешаны две независимые оси: `_tag` описывает форму AST node, phantom marker связывает generic value type.
- **Как обнаружили:** compile-time experiment с удалённым marker и неизменным runtime object.
- **Статус:** объяснено; устойчивое самостоятельное mastery ещё нужно проверить на входе в урок 3.
- **Профилактика:** при type error отдельно выписывать runtime fields и type-only fields.

## M2. One-to-many reducer не создавал первую группу

- **Наблюдение:** resolver E2.6 добавлял post только в уже существующий массив, но никогда не создавал массив для первой row.
- **Последствие:** всем requests возвращался `[]`, хотя physical query получал posts.
- **Как обнаружили:** smoke test реального распределения rows по userId.
- **Статус:** исправлено и подтверждено exact groups `10,11 / [] / 30`.
- **Профилактика:** для groupBy проверять три состояния: первая row key, следующая row той же key, отсутствующая key.

## M3. Acceptance test доказывал batching, но не SQL filter

- **Наблюдение:** fake Driver игнорировал `sql` и `params`; `queryCounter === 1` проходил бы даже после удаления `WHERE IN`.
- **Последствие:** test мог оставаться зелёным при full-table query.
- **Статус:** обнаружено; при следующих fake Driver tests обязательно захватывать observable inputs, важные для contract.
- **Профилактика:** мысленно удалить ключевую production line и проверить, станет ли test красным.

## M4. Effect и Stream были перепутаны внутри adapter

- **Наблюдение:** первая попытка typed Stream использовала type-only Driver import как value, `yield*` для Stream и неверную форму chunkSize.
- **Причина:** смешаны effectful acquisition (`yield* Driver`) и возвращаемый lazy Stream value.
- **Статус:** исправлено; adapter и typecheck прошли.
- **Профилактика:** до кода подписывать тип каждого промежуточного выражения: `Effect`, `Stream` или plain value.

## M5. Raw row был принят за автоматически доказанный `R`

- **Наблюдение:** `Select<R>` сначала воспринимался как достаточная runtime гарантия формы driver row.
- **Причина:** compile-time promise был принят за runtime validation.
- **Статус:** граница assertion названа; полноценный decoder/Schema boundary ещё не реализован.
- **Профилактика:** на каждом `unknown as R` записывать, какой внешний инвариант делает assertion допустимой и чем он проверяется.

## M6. Accumulator менял форму между initial и reducer

- **Наблюдение:** `Stream.runFold` начинался с `0`, а reducer возвращал `{ sum, count }`.
- **Причина:** не был зафиксирован единый state type `Z` fold.
- **Статус:** исправлено; миллионный fold использует bounded object accumulator.
- **Профилактика:** сначала определить форму state между любыми двумя iterations, затем initial и transition.

## M7. SQL VALUES воспринимался как один плоский список

- **Наблюдение:** `VALUES (?, ?, ?)` использовался для трёх строк одной колонки.
- **Причина:** не различались header columns, row tuples и values внутри tuple.
- **Статус:** модель матрицы подтверждена на двух колонках/двух строках и применена в test.
- **Профилактика:** рисовать shape `rows × columns`; каждый tuple — одна row, позиция внутри tuple — одна header column.

## M8. Heavy experiment попал в постоянный test

- **Наблюдение:** SQLite integration test был увеличен до миллиона rows, но oracle остался от трёх rows.
- **Последствие:** test стал медленным и всё равно не доказывал отсутствие materialization.
- **Статус:** постоянный test возвращён к N=10; миллион вынесен в standalone experiment.
- **Профилактика:** contract tests держать малыми; performance/memory hypothesis проверять отдельным process experiment.

## M9. Забытый `yield*` сохранил Effect как data

- **Наблюдение:** поле `after` содержало `{ _id: 'Effect', op: 'Sync' }`, snapshot не создавался.
- **Причина:** Effect был сконструирован, но не исполнен внутри `Effect.gen`.
- **Статус:** исправлено; before/after snapshots созданы.
- **Профилактика:** если output содержит Effect object, искать boundary, где program value положили в result без composition/yield.

## M10. Development import condition не был активирован

- **Наблюдение:** прямой `tsx` запуск выбрал package import `default: ./dist/*`, которого не было.
- **Причина:** source aliases `#*` зависят от condition `development`.
- **Статус:** рабочая команда для source experiment использует `node --conditions=development --import tsx ...`.
- **Профилактика:** отдельно проверять source-run и built-package import paths; не считать их одним execution mode.

## M11. Recursive CTE не имел consumer statement

- **Наблюдение:** `WITH RECURSIVE ...` завершался после определения CTE и давал `incomplete input`.
- **Причина:** CTE — временный named result для следующего SELECT/INSERT/UPDATE/DELETE, а не самостоятельный statement.
- **Статус:** исправлено через `INSERT INTO ... SELECT n FROM seq`.
- **Профилактика:** читать WITH как prefix к одному полному statement и явно называть его consumer.

## Повторяющийся debugging protocol

1. Записать expected observable behavior.
2. Зафиксировать actual value/type/SQL/error на конкретной boundary.
3. Выбрать одну гипотезу, которая различает expected и actual.
4. Сделать минимальное наблюдение, способное её опровергнуть.
5. Пользователь исправляет source cause.
6. Повторить тот же сценарий, а не заменять его более удобной проверкой.
