# Механика resource pool: пять разных «пулов»

> Версии, к которым привязаны выводы: Node.js **25.9.0** (в нём libuv **1.51.0**), `pg-pool` **3.14.0**, `effect` **4.0.0-rc.108**, `@electric-sql/pglite` **0.5.7**. Исследование ограничено механизмами pool/лимитирования; ORM API не рассматривается.
>
> Обозначения ниже: **Факт** — непосредственно наблюдаемое поведение документации или исходника; **Синтез** — вывод, собранный из этих фактов. Это разделение важно: одинаковое слово «pool» скрывает разные объекты и протоколы.

## 1. Общая модель resource pool

**Факт.** Effect определяет pool как ограниченный набор значений `A`, которые могут быть связаны с acquire/release ресурсов; `get` выдаёт значение на срок `Scope`, `invalidate` исключает негодный экземпляр, а закрытие scope освобождает все созданные экземпляры. В runtime-состоянии есть scope, множества всех/доступных/инвалидированных items, semaphore, latch, число waiters и флаг shutdown ([Effect `Pool.ts`, модель и state](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L21-L111)).

**Синтез.** Полезная общая модель состоит не из одного счётчика, а из двух плоскостей:

1. **Жизненный цикл экземпляров:** `absent/allocating → available → checked-out (in use) → available`, с боковыми переходами `failed`, `invalidated/retiring`, `closed`.
2. **Жизненный цикл запросов:** `arrived → served immediately | queued → granted → completed/cancelled/failed`.

Типичные структуры данных:

- коллекция всех живых экземпляров;
- коллекция idle/available экземпляров;
- очередь/набор ожидающих запросов;
- счётчики ёмкости и использования;
- отдельное состояние shutdown;
- finalizer/close для каждого экземпляра.

Из этого следуют проверяемые общие инварианты:

- экземпляр нельзя одновременно считать idle и эксклюзивно выданным;
- число созданных экземпляров не превышает лимит реализации;
- успешный checkout обязан иметь ровно один симметричный release/finalizer;
- failed/invalidated экземпляр не должен вернуться в available;
- shutdown запрещает новые выдачи и в конце освобождает созданные ресурсы.

Это **синтез**, а не обещание каждого API. Например, libuv выдаёт не worker вызывающему коду, а выполняет queued work внутри worker; `http.Agent` назначает socket запросу без публичного checkout; semaphore вообще не создаёт экземпляры.

## 2. `pg.Pool` / `pg-pool` 3.14.0: пул PostgreSQL-соединений

### Состояния и структуры

**Факт.** Реализация хранит `_clients`, `_idle`, `_pendingQueue`, `_expired`, `ending/ended`; defaults: `max = 10`, `min = 0`, `maxUses = Infinity`, `idleTimeoutMillis = 10000` ([исходник 3.14.0](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L66-L105)). Документация уточняет: pool стартует пустым и создаёт clients лениво; `min` не прогревает pool, а лишь не даёт idle eviction опуститься ниже min ([официальный `pg.Pool` API](https://node-postgres.com/apis/pool#new-pool)).

**Факт.** `_idle` — массив `IdleItem(client, idleListener, timeoutId)`, `_pendingQueue` — массив `PendingItem(callback)`. Следующий waiter берётся через `shift()` (FIFO), а idle client — через `pop()` (LIFO) ([`_pulseQueue`](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L113-L157)). Официальная документация также прямо обещает FIFO для ожидающих `pool.connect()` при заполненном pool ([`pool.connect`](https://node-postgres.com/apis/pool#poolconnect)).

### Acquire / wait / release

**Факт.** `connect()`:

1. отклоняется после `end()`;
2. если pool полон или есть idle client — ставит callback в `_pendingQueue` и запускает pulse;
3. иначе немедленно начинает создание `new Client`;
4. при `connectionTimeoutMillis` waiter удаляется из queue и получает timeout error ([`connect`](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L178-L228)).

**Факт.** При выдаче client получает одноразовую `release`; второй вызов бросает `Release called ... already been released`. Release с error, во время shutdown, для не-queryable/ending/expired client либо после `maxUses` уничтожает соединение; иначе client кладётся в `_idle`, затем pulse обслуживает следующего waiter ([acquire/release](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L309-L415)). `pool.query()` выполняет checkout/release автоматически, но не подходит для транзакции: отдельные вызовы могут попасть на разные clients ([официальный `pool.query`](https://node-postgres.com/apis/pool#poolquery)).

**Инвариант, подтверждённый кодом.** `_clients.length <= max`; один checked-out client имеет одну действующую release-функцию; error release не возвращает client в idle.

### Idle, failure, cancellation, shutdown

**Факт.** Idle client сверх `min` удаляется по `idleTimeoutMillis`; `allowExitOnIdle` вызывает `unref()` у timer/socket; lifetime и `maxUses` дают дополнительные политики ротации ([официальные options](https://node-postgres.com/apis/pool#new-pool), [реализация idle eviction](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L367-L415)).

**Факт.** Ошибка создания удаляет client из `_clients`, запускает pulse для следующего waiter и возвращает ошибку текущему. Ошибка idle client удаляет/закрывает его и эмитит `pool.error`; без listener обычная семантика EventEmitter может завершить процесс uncaught error ([new-client failure](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L230-L307), [официальный event `error`](https://node-postgres.com/apis/pool#error)).

**Факт.** У `connect(cb)` нет параметра cancellation/`AbortSignal`; подтверждённый способ убрать ожидающий checkout — `connectionTimeoutMillis`. Поэтому нельзя приписывать ему произвольную cooperative cancellation ([сигнатура и код](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L178-L228)).

**Факт.** `end()` ставит `ending`; pulse закрывает idle clients, checked-out clients закрываются при последующем release, promise `end()` завершается, когда `_clients` пуст ([shutdown](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L113-L133), [`end`](https://github.com/brianc/node-postgres/blob/544b1ce8152bc280e398dc1e8a66920abe6a640e/packages/pg-pool/index.js#L476-L491)).

## 3. Node.js 25 / libuv 1.51: worker thread pool

### Это очередь работ, а не checkout workers

**Факт.** В Node 25.9.0 встроен libuv 1.51.0 ([version header](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/include/uv/version.h#L27-L37)). libuv threadpool глобален и разделяется всеми event loops; используется всеми filesystem operations, `getaddrinfo`/`getnameinfo`, а Node дополнительно перечисляет асинхронные crypto и `dns.lookup()` APIs. Default — 4 threads, `UV_THREADPOOL_SIZE` задаётся при startup, максимум 1024 ([libuv docs](https://docs.libuv.org/en/v1.x/threadpool.html), [Node CLI docs](https://nodejs.org/docs/latest-v25.x/api/cli.html#uv_threadpool_sizesize)).

**Факт.** Инициализация заранее создаёт `nthreads`; состояние содержит глобальные mutex/condition, `idle_threads`, `nthreads`, общую `wq`, отдельную `slow_io_pending_wq` и счётчик slow work. `post()` вставляет работу в tail; worker берёт head, выполняет callback без mutex и кладёт completion в loop-local queue ([`threadpool.c`](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L30-L152), [init](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L195-L260)).

**Синтез.** Здесь pooled resource — внутренний worker thread, но public protocol — **submit work**, а не `acquire thread / release thread`. Ёмкость ограничивает одновременно исполняемую blocking work; лишние `uv__work` ждут в queue.

### Fairness, cancellation, failure, shutdown

**Факт.** Обычная work ставится в tail и берётся с head, то есть наблюдается FIFO-механика общей очереди. Но strict global FIFO обещать нельзя: slow I/O идёт через отдельную очередь/маркер и ограничено порогом `(nthreads + 1) / 2`; маркер может переставляться в tail ([worker scheduling](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L45-L120)).

**Факт.** `uv_cancel()` успешно удаляет только ещё queued request. Если request уже выполняется/завершён, возвращается `UV_EBUSY`; успешная cancellation всё равно планирует completion, где `after_work_cb` получает `UV_ECANCELED` ([cancellation source](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L281-L331), [официальный API](https://docs.libuv.org/en/v1.x/threadpool.html#c.uv_queue_work)).

**Факт.** Для `uv_queue_work` `work_cb` исполняется на worker, `after_work_cb` — на loop thread со status `0` либо cancellation status. Это не универсальная typed failure-модель: пользовательская C-функция `work_cb` возвращает `void` ([API implementation](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L333-L375)).

**Факт.** Нет idle TTL/checkout release; threads ждут на condition. Внутренний `uv__threadpool_cleanup` посылает exit marker и `join`-ит все threads ([cleanup](https://github.com/nodejs/node/blob/v25.9.0/deps/uv/src/threadpool.c#L154-L193)).

## 4. Node.js `http.Agent`: reuse TCP sockets для HTTP requests

### Состояние и dispatch

**Факт.** Agent управляет persistence/reuse соединений и очередями pending requests по host:port. После опустошения очереди socket уничтожается либо сохраняется в free pool в зависимости от `keepAlive` ([официальное описание](https://nodejs.org/docs/latest-v25.x/api/http.html#class-httpagent)). Реализация хранит индексированные по origin `requests`, `sockets`, `freeSockets` и `totalSocketCount`; defaults: `keepAlive=false`, `maxSockets=Infinity`, `maxTotalSockets=Infinity`, `maxFreeSockets=256`, free-socket scheduling=`lifo` ([constructor](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L74-L126)).

**Факт.** `addRequest` сначала выбирает free socket (`shift` для FIFO или `pop` для LIFO), иначе создаёт socket, если не достигнуты per-origin и global limits, иначе делает `requests[name].push(req)`. Когда socket освобождается, oldest same-origin pending request берётся через `shift()`; только при отсутствии waiter socket может попасть в `freeSockets` ([addRequest](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L300-L364), [free handler](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L119-L179)).

**Синтез.** У Agent две разные политики, которые нельзя смешивать:

- pending requests одного origin обслуживаются FIFO;
- выбор **free socket** для нового request — настраиваемый FIFO/LIFO, default LIFO.

**Факт.** Strict fairness между origins не гарантирована: исходник прямо отмечает, что логика replacement «will not be FIFO across origins» и может приоритизировать origin освободившегося socket ([`removeSocket`](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L468-L527)).

### Release, idle, failure, shutdown

**Факт.** Публичного `checkout/release` socket нет: завершение HTTP request вызывает событие `free`; Agent либо напрямую передаёт socket waiter, либо уничтожает его, либо сохраняет. Free socket не сохраняется при `keepAlive=false`, превышении limits или небезопасном server timeout hint ([free handler](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L119-L179), [`keepSocketAlive`](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L529-L568)).

**Факт.** Server/client close удаляет socket. Error на free socket уничтожает его; connect error передаётся request; закрытие socket может инициировать создание replacement для pending request ([listeners и removal](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L420-L527)).

**Факт.** `agent.destroy()` вызывает `destroy()` для free и active sockets; документация рекомендует это, потому что unused sockets потребляют OS resources ([source](https://github.com/nodejs/node/blob/v25.9.0/lib/_http_agent.js#L579-L590), [официальный `agent.destroy`](https://nodejs.org/docs/latest-v25.x/api/http.html#agentdestroy)). Это не «graceful drain» с ожиданием checkout release, как у connection/resource pool.

## 5. Effect `Pool` 4.0.0-rc.108

### Конфигурация, состояние и sizing

**Факт.** Exact API:

```ts
Pool.make({ acquire, size, concurrency?, targetUtilization? })
Pool.makeWithTTL({ acquire, min, max, concurrency?, targetUtilization?, timeToLive, timeToLiveStrategy? })
Pool.get(pool): Effect<A, E, Scope.Scope>
Pool.invalidate(pool, item): Effect<void, never, Scope.Scope>
```

`make` — fixed-size (`min=max=size`); `concurrency` default 1 означает permits **на один item**, а не число items. `targetUtilization` clamp-ится в `[0.1, 1]` ([constructors](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L127-L300), [configuration construction](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L332-L382)).

**Факт.** Capacity semaphore создаётся с `concurrency * max`; каждый `get` берёт один permit. Item хранит `Exit<A,E>`, finalizer, `refCount`, `disableReclaim`. Он available, пока `refCount < concurrency`. Следовательно, при `concurrency=1` checkout эксклюзивен; при большем значении один и тот же `A` сознательно разделяется несколькими fibers ([state/item](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L53-L111), [`getPoolItem`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L419-L478)).

**Факт.** Target size вычисляется как `ceil((waiters + sum(refCount)) / targetUtilization / concurrency)`, ограниченный `min..max`; `resize` параллельно делает acquire недостающих items. Acquire — scoped: отдельный child Scope превращается в item finalizer ([resize/allocate/target](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L554-L642)).

### Acquire/release, cancellation и failure

**Факт.** `Pool.get` — scoped checkout: permit берётся interruptibly; после выдачи finalizer текущего Scope уменьшает `refCount`, обрабатывает invalidation и освобождает permit. Поэтому normal success, typed failure после выдачи и interruption пользовательского effect возвращают checkout при закрытии Scope ([`get` implementation](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L397-L478)).

**Факт.** Прерванное ожидание semaphore удаляется из waiters самой Semaphore; в Pool есть дополнительный `onInterrupt` для возврата уже взятого permit. Semaphore сканирует waiters в registration order, но меньший поздний запрос permits может обогнать больший ранний ([Effect `Semaphore.ts`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Semaphore.ts#L104-L139), [implementation](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Semaphore.ts#L228-L296)).

**Нюанс fairness.** Pool всегда берёт по одному permit, но исходник Pool не документирует strict FIFO выбора item/waiter: available/invalidated — `Set`, ожидание availability также идёт через `Latch`. Корректная формулировка — interruptible bounded waiting без подтверждённой гарантии строгой FIFO всего `Pool.get`, а не обещание fairness, которого API не даёт.

**Факт.** Ошибка `acquire` сохраняется как failure `Exit`; получивший её `get` удаляет failed item из всех sets, возвращает permit и завершается с `E`. `invalidate` ищет успешное значение по strict equality: idle item финализируется сразу и запускает resize; in-use item помечается invalidated и финализируется после последнего release ([failure path](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L419-L478), [invalidate](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L480-L552)).

### Idle и shutdown

**Факт.** Fixed `make` не shrink-ит. `makeWithTTL` имеет стратегии `"creation"` (TTL от создания) и `"usage"` (default; периодически reclaim excess относительно target); min остаётся нижней границей target ([TTL strategies](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L644-L726)).

**Факт.** Закрытие owning Scope ставит `isShuttingDown`; idle items финализируются, in-use items помечаются invalidated и shutdown ждёт их finalizers. Новые `get` interrupt-ятся; latch открывается, чтобы разбудить ожидающих ([shutdown](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L384-L420)). Порядок release items официально unspecified ([документация `make`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L127-L178)).

## 6. PGlite 0.5.7: одна exclusive connection, не connection pool

**Факт.** Официальная документация прямо говорит: «PGlite only has a single exclusive connection to the database» ([Getting started](https://pglite.dev/docs/#what-next)). Исходник запускает PostgreSQL с первым аргументом `--single`, отключает parallel workers и хранит mutexes query/transaction ([PGlite 0.5.7 `pglite.ts`](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/pglite.ts#L97-L162)).

**Факт.** Public `query` и `exec` вызывают `_runExclusiveTransaction`; transaction удерживает тот же lock вокруг `BEGIN → callback → COMMIT/ROLLBACK`. Низкоуровневые query/exec дополнительно проходят query mutex ([`BasePGlite.query/exec`](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/base.ts#L177-L235), [`transaction`](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/base.ts#L449-L530), [mutex delegation](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/pglite.ts#L1277-L1297)). Это подтверждает сериализацию, но PGlite API не документирует fairness/cancellation очереди mutex — их не следует обещать.

**Факт.** `PGlite.create(options)` создаёт новый `PGlite`, ждёт `waitReady` и возвращает экземпляр; `close()` закрывает extensions, протокол, filesystem и WASM runtime, после чего query получает `PGlite is closed` ([create](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/pglite.ts#L207-L258), [close/readiness](https://github.com/electric-sql/pglite/blob/faa505ad2ea0d14dfb1c99ab9614361c39d2c7e2/packages/pglite/src/pglite.ts#L772-L898)).

### Вывод для текущего `make()`

**Факт проекта.** Текущий `make(options)` помещает `PGlite.create(options)` внутрь `Effect.acquireRelease`, а release вызывает `instance.close()`; затем создаёт `Driver`, замкнутый на этот конкретный `pg` ([`src/drivers/pglite.ts`](../../src/drivers/pglite.ts#L49-L72)).

**Синтез.** Если использовать `Pool.make({ acquire: make(options), size: N })`, то **каждая аллокация item** вызывает `PGlite.create()` и создаёт целый самостоятельный PGlite/WASM/Postgres экземпляр со своим lifecycle и своим single-connection mutex. Это не превращает одну PGlite database connection в `N` server connections, как `pg.Pool`; это pool из `N` тяжёлых database instances/Drivers. С default in-memory options это также не pool соединений к одному общему backend: каждый `create()` создаёт свой instance. Для сохранения семантики «один PGlite instance, строго один запрос/транзакция одновременно» адекватная ёмкость — один экземпляр (`size: 1`, `concurrency: 1`); тогда Effect Pool добавляет scoped checkout/backpressure/lifecycle, но не увеличивает DB parallelism.

**Граница подтверждённого.** Нельзя без отдельной гарантии PGlite считать несколько `PGlite.create()` с одинаковым persistent `dataDir` безопасным способом параллельного доступа: изученные источники гарантируют single exclusive connection **внутри экземпляра**, но не дают такой гарантии для нескольких WASM runtimes над одним хранилищем.

## 7. Почему pool ≠ semaphore / concurrency limiter

**Факт.** Effect Semaphore владеет числом **permits**: `withPermits` берёт permits, запускает уже заданный effect и возвращает permits на exit; runtime state — `permits`, `taken`, `waiters`. Он не содержит `A`, acquire `A`, item finalizer, idle collection или invalidation ([официальный исходник `Semaphore`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Semaphore.ts#L1-L139), [state/algorithm](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Semaphore.ts#L228-L296)). Effect Pool, напротив, хранит `PoolItem<A,E>`, acquire `Effect<A,E,Scope>`, finalizer, sets и invalidation — и **использует semaphore как один внутренний механизм capacity** ([Pool state](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L53-L111), [construction](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Pool.ts#L332-L382)).

**Синтез.** Разница по контракту:

- **Limiter/semaphore:** «не более `K` работ одновременно»; permits взаимозаменяемы и не являются реальными ресурсами.
- **Resource pool:** «выдай один конкретный живой `A`, затем верни/инвалидируй/закрой именно его»; экземпляры имеют identity, состояние, цену создания и failure lifecycle.
- Pool может включать limiter (Effect: `concurrency * max` permits), но limiter сам по себе не становится pool.
- Для единственного PGlite instance semaphore с 1 permit достаточно, чтобы сериализовать доступ; Pool размера 1 нужен лишь если одновременно требуется владеть созданием/закрытием и scoped выдачей самого `Driver`.

## 8. Сравнительная таблица

| Реализация                 | Pooled resource                                                 | Queued unit                                    | Capacity                                                       | Checkout / release                                                                   | Idle policy                                                                                                         | Failure behavior                                                                                                     |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pg.Pool` 3.14.0           | `pg.Client` / PostgreSQL connection                             | `pool.connect()` waiter                        | `max` clients, default 10                                      | `await pool.connect()` / одноразовый `client.release(err?)`; `pool.query` делает оба | LIFO idle reuse; default eviction 10 s выше `min`; lifetime/maxUses                                                 | connect failure удаляет client и продолжает queue; error release уничтожает; idle error удаляет и эмитит `error`     |
| libuv 1.51 threadpool      | Internal worker thread                                          | `uv__work` (FS/DNS/crypto/user work)           | `UV_THREADPOOL_SIZE`, default 4, max 1024                      | Нет checkout; `uv_queue_work` / completion автоматически освобождает worker          | Threads ждут на condition; TTL нет                                                                                  | queued work можно cancel → `UV_ECANCELED`; running → `UV_EBUSY`; completion на loop thread                           |
| Node 25 `http.Agent`       | TCP socket, сгруппированный по origin                           | HTTP `ClientRequest`                           | `maxSockets` per origin + `maxTotalSockets`, defaults Infinity | Нет public checkout; request получает socket / событие `free`                        | `keepAlive=false` уничтожает; иначе free pool до `maxFreeSockets`, server hint/timeout; free selection default LIFO | free-socket error/close уничтожает и удаляет; connect error идёт request; pending может получить replacement         |
| Effect Pool rc.108         | Scoped `A` + `Exit` + finalizer                                 | Fiber, выполняющий `Pool.get`                  | `max` items × `concurrency` per item                           | `Pool.get` внутри `Scope`; scope finalizer возвращает; `Pool.invalidate` retire-ит   | fixed без shrink или TTL creation/usage сверх min                                                                   | acquire `E` приходит caller и failed item удаляется; interruption возвращает permit; shutdown ждёт in-use finalizers |
| PGlite 0.5.7 (сам по себе) | **Не pool:** один WASM Postgres instance / exclusive connection | Public query/exec/transaction, ожидающий mutex | 1 DB operation/transaction per instance                        | `PGlite.create` / `close`; query checkout API нет                                    | Instance живёт до `close`; idle eviction нет                                                                        | query errors reject; после closing/closed новые operations reject; fairness/cancellation mutex публично не обещаны   |
| Semaphore / limiter        | Permit, не resource instance                                    | Работа, ожидающая permit                       | Число permits                                                  | `withPermits` или `take` / `release`                                                 | Неприменимо                                                                                                         | Failure/interruption guarded effect возвращает permits; нет health/invalidate ресурса                                |

## 9. Короткая карта выбора

- Нужны несколько независимых server connections и транзакция привязана к одной из них → connection pool (`pg.Pool`).
- Нужно вынести поддерживаемую libuv blocking work с event loop → встроенная work queue; это не DB/API pool.
- Нужно переиспользовать HTTP TCP connections → `http.Agent`; capacity и очередь разделены по origin.
- Нужно владеть bounded набором произвольных scoped `A`, заменять broken items и закрывать их вместе со Scope → Effect Pool.
- Нужно только ограничить число одновременно исполняемых операций над уже существующим объектом → semaphore/limiter.
- Для текущего PGlite `make()` pool size больше 1 означает больше `PGlite.create()`/WASM instances, а не больше соединений к одному Postgres backend; single-instance exclusivity остаётся фундаментальным ограничением.
