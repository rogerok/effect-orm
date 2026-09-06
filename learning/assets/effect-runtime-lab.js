const runtimeScenarios = {
  sequential: {
    title: 'yield*: одна fiber ждёт I/O',
    code: `const rows = yield* db.executeRaw(sql, [])
return rows`,
    steps: [
      {
        time: 't0',
        note: 'runPromise создаёт root fiber. Вложенный Effect не создаёт новую fiber.',
        fibers: [
          {
            id: 'F0',
            label: 'root / request',
            parent: 'runtime',
            state: 'running',
            detail: 'выполняет executeRaw',
          },
        ],
        scopes: [],
        events: ['runtime → запущена F0', 'F0 → вошла в executeRaw'],
      },
      {
        time: 't1',
        note: 'Асинхронное ожидание паркует только F0. JavaScript thread свободен исполнять другие callbacks и fibers.',
        fibers: [
          {
            id: 'F0',
            label: 'root / request',
            parent: 'runtime',
            state: 'waiting',
            detail: 'sleep / Promise / socket I/O',
          },
        ],
        scopes: [],
        events: ['F0 → suspended', 'scheduler → ждёт событие готовности'],
      },
      {
        time: 't2',
        note: 'Событие готовности делает F0 runnable. Scheduler снова даёт ей ход.',
        fibers: [
          {
            id: 'F0',
            label: 'root / request',
            parent: 'runtime',
            state: 'running',
            detail: 'получила rows',
          },
        ],
        scopes: [],
        events: ['timer/socket → готов', 'scheduler → возобновил F0'],
      },
      {
        time: 't3',
        note: 'Результат возвращён. Конкурентности внутри этого workflow не было.',
        fibers: [
          {
            id: 'F0',
            label: 'root / request',
            parent: 'runtime',
            state: 'done',
            detail: 'Success(rows)',
          },
        ],
        scopes: [],
        events: ['F0 → Success(rows)'],
      },
    ],
  },
  childJoin: {
    title: 'forkChild + join: явный handle',
    code: `const queryFiber = yield* query.pipe(Effect.forkChild)
yield* collectMetrics
const rows = yield* Fiber.join(queryFiber)`,
    steps: [
      {
        time: 't0',
        note: 'F0 исполняет forkChild. Результат операции — handle Fiber, а не rows.',
        fibers: [
          {
            id: 'F0',
            label: 'parent',
            parent: 'runtime',
            state: 'running',
            detail: 'forkChild(query)',
          },
        ],
        scopes: [],
        events: ['F0 → forkChild(query)'],
      },
      {
        time: 't1',
        note: 'F1 связана с родителем. Обе fiber могут продвигаться независимо.',
        fibers: [
          {
            id: 'F0',
            label: 'parent',
            parent: 'runtime',
            state: 'running',
            detail: 'collectMetrics',
          },
          {
            id: 'F1',
            label: 'query child',
            parent: 'F0',
            state: 'running',
            detail: 'executeRaw',
          },
        ],
        scopes: [],
        events: ['F1 → создана как child F0', 'F0 → продолжила collectMetrics'],
      },
      {
        time: 't2',
        note: 'F1 ждёт I/O, пока F0 делает независимую работу. Это concurrency, не обещание двух CPU одновременно.',
        fibers: [
          {
            id: 'F0',
            label: 'parent',
            parent: 'runtime',
            state: 'running',
            detail: 'collectMetrics',
          },
          {
            id: 'F1',
            label: 'query child',
            parent: 'F0',
            state: 'waiting',
            detail: 'socket I/O',
          },
        ],
        scopes: [],
        events: ['F1 → suspended на I/O', 'F0 → продолжает работу'],
      },
      {
        time: 't3',
        note: 'После своей работы F0 вызывает join и паркуется до Exit дочерней fiber.',
        fibers: [
          {
            id: 'F0',
            label: 'parent',
            parent: 'runtime',
            state: 'waiting',
            detail: 'Fiber.join(F1)',
          },
          {
            id: 'F1',
            label: 'query child',
            parent: 'F0',
            state: 'waiting',
            detail: 'socket I/O',
          },
        ],
        scopes: [],
        events: ['F0 → suspended на join(F1)'],
      },
      {
        time: 't4',
        note: 'F1 завершается; join передаёт её успех или ошибку в F0.',
        fibers: [
          {
            id: 'F0',
            label: 'parent',
            parent: 'runtime',
            state: 'running',
            detail: 'получила rows',
          },
          {
            id: 'F1',
            label: 'query child',
            parent: 'F0',
            state: 'done',
            detail: 'Success(rows)',
          },
        ],
        scopes: [],
        events: ['F1 → Success(rows)', 'join → возобновил F0'],
      },
    ],
  },
  parentExit: {
    title: 'forkChild: родитель ушёл раньше',
    code: `yield* worker.pipe(Effect.forkChild)
return 'request finished'`,
    steps: [
      {
        time: 't0',
        note: 'Worker запущен дочерней fiber. В её scope зарегистрирован cleanup.',
        fibers: [
          {
            id: 'F0',
            label: 'request',
            parent: 'runtime',
            state: 'running',
            detail: 'готовит response',
          },
          {
            id: 'F1',
            label: 'worker child',
            parent: 'F0',
            state: 'waiting',
            detail: 'sleep / I/O',
          },
        ],
        scopes: [
          {
            id: 'S-child',
            label: 'child scope F0',
            state: 'open',
            finalizers: 1,
          },
        ],
        events: [
          'F1 → acquire resource',
          'S-child → зарегистрирован finalizer',
        ],
      },
      {
        time: 't1',
        note: 'F0 заканчивается. Auto supervision посылает interrupt незавершённой F1.',
        fibers: [
          {
            id: 'F0',
            label: 'request',
            parent: 'runtime',
            state: 'done',
            detail: 'Success(response)',
          },
          {
            id: 'F1',
            label: 'worker child',
            parent: 'F0',
            state: 'interrupted',
            detail: 'получила interrupt',
          },
        ],
        scopes: [
          {
            id: 'S-child',
            label: 'child scope F0',
            state: 'closing',
            finalizers: 1,
          },
        ],
        events: ['F0 → Success(response)', 'F0 termination → interrupt F1'],
      },
      {
        time: 't2',
        note: 'Interruption прекращает обычное продолжение, но finalizer всё равно исполняется.',
        fibers: [
          {
            id: 'F0',
            label: 'request',
            parent: 'runtime',
            state: 'done',
            detail: 'Success(response)',
          },
          {
            id: 'F1',
            label: 'worker child',
            parent: 'F0',
            state: 'finalizing',
            detail: 'release(resource)',
          },
        ],
        scopes: [
          {
            id: 'S-child',
            label: 'child scope F0',
            state: 'closing',
            finalizers: 1,
          },
        ],
        events: [
          'F1 → обычная работа отменена',
          'finalizer → release(resource)',
        ],
      },
      {
        time: 't3',
        note: 'Ресурс не утёк. F1 завершилась interrupted; scope закрыт.',
        fibers: [
          {
            id: 'F0',
            label: 'request',
            parent: 'runtime',
            state: 'done',
            detail: 'Success(response)',
          },
          {
            id: 'F1',
            label: 'worker child',
            parent: 'F0',
            state: 'done',
            detail: 'Interrupted',
          },
        ],
        scopes: [
          {
            id: 'S-child',
            label: 'child scope F0',
            state: 'closed',
            finalizers: 0,
          },
        ],
        events: ['release → завершён', 'S-child → closed'],
      },
    ],
  },
  scopedWorker: {
    title: 'forkScoped: worker живёт со Scope',
    code: `Effect.scoped(Effect.gen(function* () {
  yield* heartbeat.pipe(Effect.forkScoped)
  yield* serveRequests
}))`,
    steps: [
      {
        time: 't0',
        note: 'Effect.scoped открывает application Scope. F0 запускает worker в этом Scope.',
        fibers: [
          {
            id: 'F0',
            label: 'application',
            parent: 'runtime',
            state: 'running',
            detail: 'forkScoped(heartbeat)',
          },
        ],
        scopes: [
          {
            id: 'S-app',
            label: 'application scope',
            state: 'open',
            finalizers: 0,
          },
        ],
        events: ['S-app → open', 'F0 → forkScoped(heartbeat)'],
      },
      {
        time: 't1',
        note: 'Инициализация закончилась, но application Scope открыт. Worker продолжает жить, пока приложение обслуживает запросы.',
        fibers: [
          {
            id: 'F0',
            label: 'application',
            parent: 'runtime',
            state: 'waiting',
            detail: 'serveRequests',
          },
          {
            id: 'F1',
            label: 'heartbeat',
            parent: 'S-app',
            state: 'waiting',
            detail: 'sleep до следующего tick',
          },
        ],
        scopes: [
          {
            id: 'S-app',
            label: 'application scope',
            state: 'open',
            finalizers: 1,
          },
        ],
        events: ['F1 → привязана к S-app', 'F0 → serveRequests'],
      },
      {
        time: 't2',
        note: 'При shutdown закрывается S-app. Именно закрытие Scope, а не завершение отдельной init-функции, останавливает worker.',
        fibers: [
          {
            id: 'F0',
            label: 'application',
            parent: 'runtime',
            state: 'finalizing',
            detail: 'shutdown',
          },
          {
            id: 'F1',
            label: 'heartbeat',
            parent: 'S-app',
            state: 'interrupted',
            detail: 'scope closed',
          },
        ],
        scopes: [
          {
            id: 'S-app',
            label: 'application scope',
            state: 'closing',
            finalizers: 1,
          },
        ],
        events: ['S-app → closing', 'S-app → interrupt F1'],
      },
      {
        time: 't3',
        note: 'Worker остановлен, его cleanup выполнен, затем закрыт application Scope.',
        fibers: [
          {
            id: 'F0',
            label: 'application',
            parent: 'runtime',
            state: 'done',
            detail: 'Success',
          },
          {
            id: 'F1',
            label: 'heartbeat',
            parent: 'S-app',
            state: 'done',
            detail: 'Interrupted + cleanup',
          },
        ],
        scopes: [
          {
            id: 'S-app',
            label: 'application scope',
            state: 'closed',
            finalizers: 0,
          },
        ],
        events: ['F1 cleanup → завершён', 'S-app → closed'],
      },
    ],
  },
  pool: {
    title: 'Pool(1): две fiber, один Driver',
    code: `const use = Effect.scoped(Effect.gen(function* () {
  const driver = yield* Pool.get(pool)
  return yield* driver.executeRaw(sql, [])
}))
yield* Effect.all([use, use], { concurrency: 2 })`,
    steps: [
      {
        time: 't0',
        note: 'S-app владеет пулом и физическим Driver. Две fiber начинают отдельные request Scope.',
        fibers: [
          {
            id: 'F1',
            label: 'request A',
            parent: 'F0',
            state: 'running',
            detail: 'Pool.get',
          },
          {
            id: 'F2',
            label: 'request B',
            parent: 'F0',
            state: 'running',
            detail: 'Pool.get',
          },
        ],
        scopes: [
          { id: 'S-app', label: 'pool lifetime', state: 'open', finalizers: 1 },
          { id: 'S-A', label: 'checkout A', state: 'open', finalizers: 0 },
          { id: 'S-B', label: 'checkout B', state: 'open', finalizers: 0 },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'idle', owner: '—' }],
          waiters: [],
        },
        events: ['F1, F2 → Pool.get одновременно'],
      },
      {
        time: 't1',
        note: 'A получила единственный permit. B паркуется в очереди; JavaScript thread не блокируется.',
        fibers: [
          {
            id: 'F1',
            label: 'request A',
            parent: 'F0',
            state: 'waiting',
            detail: 'database I/O',
          },
          {
            id: 'F2',
            label: 'request B',
            parent: 'F0',
            state: 'waiting',
            detail: 'pool permit',
          },
        ],
        scopes: [
          { id: 'S-app', label: 'pool lifetime', state: 'open', finalizers: 1 },
          { id: 'S-A', label: 'checkout A', state: 'open', finalizers: 1 },
          { id: 'S-B', label: 'checkout B', state: 'open', finalizers: 0 },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'busy', owner: 'F1 / A' }],
          waiters: ['F2'],
        },
        events: ['F1 → lease Driver 1', 'F2 → ждёт permit'],
      },
      {
        time: 't2',
        note: 'A завершила запрос. Закрытие S-A запускает return: Driver не уничтожается, а снова становится доступен.',
        fibers: [
          {
            id: 'F1',
            label: 'request A',
            parent: 'F0',
            state: 'finalizing',
            detail: 'close S-A',
          },
          {
            id: 'F2',
            label: 'request B',
            parent: 'F0',
            state: 'waiting',
            detail: 'pool permit',
          },
        ],
        scopes: [
          { id: 'S-app', label: 'pool lifetime', state: 'open', finalizers: 1 },
          { id: 'S-A', label: 'checkout A', state: 'closing', finalizers: 1 },
          { id: 'S-B', label: 'checkout B', state: 'open', finalizers: 0 },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'returning', owner: '—' }],
          waiters: ['F2'],
        },
        events: ['S-A → closing', 'checkout finalizer → return Driver 1'],
      },
      {
        time: 't3',
        note: 'Permit передан B. Тот же экземпляр Driver используется повторно.',
        fibers: [
          {
            id: 'F1',
            label: 'request A',
            parent: 'F0',
            state: 'done',
            detail: 'Success',
          },
          {
            id: 'F2',
            label: 'request B',
            parent: 'F0',
            state: 'waiting',
            detail: 'database I/O',
          },
        ],
        scopes: [
          { id: 'S-app', label: 'pool lifetime', state: 'open', finalizers: 1 },
          { id: 'S-A', label: 'checkout A', state: 'closed', finalizers: 0 },
          { id: 'S-B', label: 'checkout B', state: 'open', finalizers: 1 },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'busy', owner: 'F2 / B' }],
          waiters: [],
        },
        events: ['F2 → lease Driver 1', 'F2 → executeRaw'],
      },
      {
        time: 't4',
        note: 'Обе выдачи закрыты. Driver простаивает в открытом пуле. Только закрытие S-app физически освободит его.',
        fibers: [
          {
            id: 'F1',
            label: 'request A',
            parent: 'F0',
            state: 'done',
            detail: 'Success',
          },
          {
            id: 'F2',
            label: 'request B',
            parent: 'F0',
            state: 'done',
            detail: 'Success',
          },
        ],
        scopes: [
          { id: 'S-app', label: 'pool lifetime', state: 'open', finalizers: 1 },
          { id: 'S-A', label: 'checkout A', state: 'closed', finalizers: 0 },
          { id: 'S-B', label: 'checkout B', state: 'closed', finalizers: 0 },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'idle', owner: '—' }],
          waiters: [],
        },
        events: ['S-B → return Driver 1', 'Driver 1 → idle, не released'],
      },
      {
        time: 't5',
        note: 'Shutdown приложения закрывает scope пула и запускает физический release Driver.',
        fibers: [],
        scopes: [
          {
            id: 'S-app',
            label: 'pool lifetime',
            state: 'closed',
            finalizers: 0,
          },
        ],
        pool: {
          resources: [{ id: 'Driver 1', state: 'released', owner: '—' }],
          waiters: [],
        },
        events: ['S-app → close', 'pool finalizer → release Driver 1'],
      },
    ],
  },
};

const stateLabels = {
  running: 'RUNNING',
  waiting: 'WAITING',
  done: 'DONE',
  interrupted: 'INTERRUPT',
  finalizing: 'FINALIZER',
};

class EffectRuntimeLab extends HTMLElement {
  connectedCallback() {
    this.step = 0;
    this.timer = undefined;
    this.innerHTML = `
      <section class="runtime-lab lab-shell" aria-labelledby="runtime-lab-title">
        <div class="runtime-toolbar">
          <label id="runtime-lab-title">Сценарий
            <select aria-label="Сценарий runtime">
              ${Object.entries(runtimeScenarios)
                .map(
                  ([key, value]) =>
                    `<option value="${key}">${value.title}</option>`,
                )
                .join('')}
            </select>
          </label>
          <div class="runtime-buttons">
            <button type="button" data-action="prev">← Назад</button>
            <button type="button" data-action="next">Шаг →</button>
            <button type="button" data-action="play">▶ Авто</button>
            <button type="button" data-action="reset">Сброс</button>
          </div>
        </div>
        <pre class="runtime-code"><code></code></pre>
        <div class="runtime-progress" aria-label="Шаг сценария"></div>
        <p class="runtime-note" aria-live="polite"></p>
        <div class="runtime-columns">
          <section><p class="kicker">Fiber tree</p><div class="fiber-tree"></div></section>
          <section><p class="kicker">Scope lifetime</p><div class="scope-list"></div></section>
          <section class="pool-column"><p class="kicker">Pool</p><div class="runtime-pool"></div></section>
        </div>
        <div class="lab-log runtime-log" role="log" aria-live="polite"></div>
      </section>`;

    this.select = this.querySelector('select');
    this.code = this.querySelector('.runtime-code code');
    this.progress = this.querySelector('.runtime-progress');
    this.note = this.querySelector('.runtime-note');
    this.fiberTree = this.querySelector('.fiber-tree');
    this.scopeList = this.querySelector('.scope-list');
    this.poolColumn = this.querySelector('.pool-column');
    this.pool = this.querySelector('.runtime-pool');
    this.log = this.querySelector('.runtime-log');
    this.select.addEventListener('change', () => this.reset());
    this.querySelector('[data-action="prev"]').addEventListener('click', () =>
      this.move(-1),
    );
    this.querySelector('[data-action="next"]').addEventListener('click', () =>
      this.move(1),
    );
    this.querySelector('[data-action="play"]').addEventListener('click', () =>
      this.play(),
    );
    this.querySelector('[data-action="reset"]').addEventListener('click', () =>
      this.reset(),
    );
    this.render();
  }

  disconnectedCallback() {
    clearInterval(this.timer);
  }

  get scenario() {
    return runtimeScenarios[this.select.value];
  }

  move(delta) {
    clearInterval(this.timer);
    this.timer = undefined;
    this.step = Math.max(
      0,
      Math.min(this.scenario.steps.length - 1, this.step + delta),
    );
    this.render();
  }

  reset() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.step = 0;
    this.render();
  }

  play() {
    clearInterval(this.timer);
    this.step = 0;
    this.render();
    this.timer = setInterval(() => {
      if (this.step >= this.scenario.steps.length - 1) {
        clearInterval(this.timer);
        this.timer = undefined;
        return;
      }
      this.step += 1;
      this.render();
    }, 1050);
  }

  render() {
    const scenario = this.scenario;
    const current = scenario.steps[this.step];
    this.code.textContent = scenario.code;
    this.note.innerHTML = `<strong>${current.time}.</strong> ${current.note}`;
    this.progress.innerHTML = scenario.steps
      .map(
        (_, index) =>
          `<span data-state="${index < this.step ? 'past' : index === this.step ? 'current' : 'future'}"></span>`,
      )
      .join('');
    this.fiberTree.innerHTML =
      current.fibers.length === 0
        ? '<p class="runtime-empty">Нет активных fiber.</p>'
        : current.fibers
            .map(
              (fiber) => `
          <div class="fiber-card" data-state="${fiber.state}">
            <div><strong>${fiber.id} · ${fiber.label}</strong><span>${stateLabels[fiber.state]}</span></div>
            <small>owner: ${fiber.parent}</small>
            <p>${fiber.detail}</p>
          </div>`,
            )
            .join('');
    this.scopeList.innerHTML =
      current.scopes.length === 0
        ? '<p class="runtime-empty">Ресурсный Scope здесь не нужен.</p>'
        : current.scopes
            .map(
              (scope) => `
          <div class="scope-card" data-state="${scope.state}">
            <div><strong>${scope.id}</strong><span>${scope.state.toUpperCase()}</span></div>
            <p>${scope.label}</p><small>finalizers: ${scope.finalizers}</small>
          </div>`,
            )
            .join('');
    this.poolColumn.hidden = !current.pool;
    if (current.pool) {
      this.pool.innerHTML =
        current.pool.resources
          .map(
            (resource) => `
        <div class="pool-card" data-state="${resource.state}">
          <strong>${resource.id}</strong><span>${resource.state}</span><small>lease: ${resource.owner}</small>
        </div>`,
          )
          .join('') +
        `<p class="runtime-waiters">waiters: ${current.pool.waiters.join(', ') || '—'}</p>`;
    }
    const lines = scenario.steps
      .slice(0, this.step + 1)
      .flatMap((step) =>
        step.events.map((event) => `${step.time.padEnd(3)} ${event}`),
      );
    this.log.textContent = lines.join('\n');
    this.log.scrollTop = this.log.scrollHeight;
    this.querySelector('[data-action="prev"]').disabled = this.step === 0;
    this.querySelector('[data-action="next"]').disabled =
      this.step === scenario.steps.length - 1;
  }
}

const forkQuestions = [
  {
    prompt:
      'Нужно получить результаты 20 независимых запросов и ограничить одновременность до 5.',
    answers: ['Effect.all', 'forkChild', 'forkScoped', 'forkDetach'],
    correct: 'Effect.all',
    feedback:
      'Высокоуровневый combinator сам создаёт и собирает fiber, сохраняет structured concurrency и применяет concurrency: 5.',
  },
  {
    prompt:
      'Нужен handle одной фоновой операции: позже проверить, дождаться или явно прервать её.',
    answers: ['Effect.all', 'forkChild', 'forkScoped', 'forkDetach'],
    correct: 'forkChild',
    feedback:
      'forkChild даёт Fiber handle и связывает ребёнка с родителем. Управляй через Fiber.join, Fiber.await или Fiber.interrupt.',
  },
  {
    prompt:
      'Heartbeat должен жить столько же, сколько application Scope, а не столько, сколько функция инициализации.',
    answers: ['Effect.all', 'forkChild', 'forkScoped', 'forkDetach'],
    correct: 'forkScoped',
    feedback:
      'forkScoped привязывает worker к текущему Scope. Закрытие application Scope прервёт worker и дождётся cleanup.',
  },
  {
    prompt:
      'Работа намеренно должна пережить родителя и принадлежать global scope; shutdown-контракт ты берёшь на себя.',
    answers: ['Effect.all', 'forkChild', 'forkScoped', 'forkDetach'],
    correct: 'forkDetach',
    feedback:
      'forkDetach — редкое исключение. Fiber переживает родителя; риск утечки и потерянной ошибки становится ответственностью приложения.',
  },
];

class ForkChoiceLab extends HTMLElement {
  connectedCallback() {
    this.index = 0;
    this.score = 0;
    this.answered = false;
    this.innerHTML = '<section class="choice-lab lab-shell"></section>';
    this.shell = this.querySelector('.choice-lab');
    this.render();
  }

  render() {
    const question = forkQuestions[this.index];
    this.shell.innerHTML = `
      <p class="kicker">Выбор API · ${this.index + 1}/${forkQuestions.length}</p>
      <p class="choice-prompt">${question.prompt}</p>
      <div class="quiz-options">
        ${question.answers.map((answer) => `<button type="button" data-answer="${answer}"><code>${answer}</code></button>`).join('')}
      </div>
      <p class="quiz-feedback" aria-live="polite">Сначала назови владельца и нужный результат, затем выбирай.</p>
      <button type="button" class="choice-next" hidden>${this.index === forkQuestions.length - 1 ? 'Показать итог' : 'Следующий случай'}</button>`;
    this.shell
      .querySelectorAll('[data-answer]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.answer(button.dataset.answer),
        ),
      );
    this.shell
      .querySelector('.choice-next')
      .addEventListener('click', () => this.next());
  }

  answer(answer) {
    if (this.answered) return;
    this.answered = true;
    const question = forkQuestions[this.index];
    const correct = answer === question.correct;
    if (correct) this.score += 1;
    this.shell.querySelectorAll('[data-answer]').forEach((button) => {
      button.disabled = true;
      button.dataset.result =
        button.dataset.answer === question.correct
          ? 'correct'
          : button.dataset.answer === answer
            ? 'incorrect'
            : 'idle';
    });
    const feedback = this.shell.querySelector('.quiz-feedback');
    feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
    feedback.textContent = `${correct ? 'Верно.' : `Нет: нужен ${question.correct}.`} ${question.feedback}`;
    this.shell.querySelector('.choice-next').hidden = false;
  }

  next() {
    if (this.index === forkQuestions.length - 1) {
      this.shell.innerHTML = `<p class="kicker">Результат</p><h3>${this.score}/${forkQuestions.length}</h3><p>${this.score === forkQuestions.length ? 'Граница выбора ясна: сначала combinator, ручной fork — только при необходимости управлять lifetime или handle.' : 'Вернись к ошибочным случаям: назови владельца fiber и событие, которое обязано завершить её.'}</p><button type="button" class="choice-restart">Повторить</button>`;
      this.shell
        .querySelector('.choice-restart')
        .addEventListener('click', () => {
          this.index = 0;
          this.score = 0;
          this.answered = false;
          this.render();
        });
      return;
    }
    this.index += 1;
    this.answered = false;
    this.render();
  }
}

customElements.define('effect-runtime-lab', EffectRuntimeLab);
customElements.define('fork-choice-lab', ForkChoiceLab);
