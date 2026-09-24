// Интерактивная модель: схема задаётся один раз, операции несут свою таблицу.
// Используется в уроке 0015; может переиспользоваться уроками про порядок записи.

const SCHEMA_TABLES = ['users', 'posts', 'comments'];
const SCHEMA_EDGES = [
  ['users', 'posts'],
  ['posts', 'comments'],
];

const OPERATIONS = [
  { table: 'comments', label: 'comment 5' },
  { table: 'posts', label: 'post 10' },
  { table: 'users', label: 'user 7' },
  { table: 'posts', label: 'post 11' },
];

const kahn = (tables, edges) => {
  const inDegree = new Map(tables.map((table) => [table, 0]));
  const adjacency = new Map(tables.map((table) => [table, []]));
  for (const [from, to] of edges) {
    adjacency.get(from).push(to);
    inDegree.set(to, inDegree.get(to) + 1);
  }
  const queue = tables.filter((table) => inDegree.get(table) === 0);
  const result = [];
  while (queue.length > 0) {
    const table = queue.shift();
    result.push(table);
    for (const next of adjacency.get(table)) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }
  return result;
};

const escape = (value) =>
  String(value).replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

class InsertOrderLab extends HTMLElement {
  connectedCallback() {
    this.queue = [];
    this.legacy = false;
    this.order = kahn(SCHEMA_TABLES, SCHEMA_EDGES);

    this.innerHTML = `
      <section class="lab-shell insert-order-lab" aria-labelledby="insert-order-title">
        <p class="kicker" id="insert-order-title">Модель · commit сортирует очередь</p>
        <div class="io-columns">
          <div class="io-box io-schema">
            <p class="io-title">Схема · задаётся один раз</p>
            <pre class="io-code">relations(users, ({ many }) =&gt; ({
  posts: many(posts, …),
}))
relations(posts, ({ many }) =&gt; ({
  comments: many(comments, …),
}))</pre>
            <p class="io-derived"><span class="io-step">1</span> рёбра:
              ${SCHEMA_EDGES.map(([from, to]) => `<code>${from} → ${to}</code>`).join(' ')}</p>
            <p class="io-derived"><span class="io-step">2</span> порядок таблиц:
              ${this.order.map((table, index) => `<code>${index}: ${table}</code>`).join(' ')}</p>
            <p class="io-stamp" aria-live="polite">Операций в очереди: 0. Схема не изменилась.</p>
          </div>
          <div class="io-box io-queue">
            <p class="io-title">Очередь Unit of Work · растёт при register</p>
            <div class="io-buttons"></div>
            <ol class="io-list" aria-label="Очередь в порядке регистрации"></ol>
          </div>
        </div>
        <div class="lab-controls io-controls">
          <label><input type="checkbox" class="io-legacy"> старый API: <code>register(effect)</code> без таблицы</label>
          <button type="button" class="io-commit">commit</button>
          <button type="button" class="io-reset">Очистить</button>
        </div>
        <div class="lab-log io-log" role="log" aria-live="polite">Зарегистрируй несколько операций в любом порядке и нажми commit.</div>
      </section>`;

    this.buttons = this.querySelector('.io-buttons');
    this.list = this.querySelector('.io-list');
    this.stamp = this.querySelector('.io-stamp');
    this.log = this.querySelector('.io-log');

    this.buttons.innerHTML = OPERATIONS.map(
      (operation, index) =>
        `<button type="button" data-index="${index}">register(<b>${operation.table}</b>, ${operation.label})</button>`,
    ).join('');
    this.buttons.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-index]');
      if (button !== null)
        this.register(OPERATIONS[Number(button.dataset.index)]);
    });
    this.querySelector('.io-legacy').addEventListener('change', (event) => {
      this.legacy = event.target.checked;
      this.render();
    });
    this.querySelector('.io-commit').addEventListener('click', () =>
      this.commit(),
    );
    this.querySelector('.io-reset').addEventListener('click', () => {
      this.queue = [];
      this.render();
      this.log.textContent = 'Очередь пуста.';
    });
    this.render();
  }

  register(operation) {
    this.queue.push(operation);
    this.render();
    this.stamp.classList.remove('io-flash');
    void this.stamp.offsetWidth;
    this.stamp.classList.add('io-flash');
  }

  chip(operation) {
    const table = this.legacy ? '?' : operation.table;
    return `<span class="io-chip" data-table="${this.legacy ? 'unknown' : escape(table)}"><b>${escape(table)}</b> · ${escape(operation.label)}</span>`;
  }

  render() {
    this.list.innerHTML =
      this.queue.length === 0
        ? '<li class="io-empty">пусто</li>'
        : this.queue
            .map((operation) => `<li>${this.chip(operation)}</li>`)
            .join('');
    this.stamp.textContent = `Операций в очереди: ${this.queue.length}. Рёбра и порядок таблиц не изменились.`;
  }

  commit() {
    if (this.queue.length === 0) {
      this.log.textContent = 'Очередь пуста: commit ничего не делает.';
      return;
    }
    const lines = [
      `Шаги 1–2 (схема): порядок таблиц ${this.order.join(' → ')} — одинаков для любой очереди.`,
    ];
    if (this.legacy) {
      lines.push(
        'Шаг 3: у операций нет таблицы. Effect нельзя открыть и узнать, куда он пишет.',
        'Позицию операции в порядке таблиц найти нельзя → сортировка невозможна.',
      );
      this.log.innerHTML = lines.map(escape).join('<br>');
      return;
    }
    lines.push(
      'Шаг 3 (операции): позиция = индекс таблицы операции в порядке таблиц.',
    );
    for (const operation of this.queue) {
      lines.push(
        `  ${operation.label}: таблица ${operation.table} → позиция ${this.order.indexOf(operation.table)}`,
      );
    }
    // Array.prototype.sort стабилен: операции одной таблицы сохраняют порядок регистрации.
    const sorted = [...this.queue].sort(
      (left, right) =>
        this.order.indexOf(left.table) - this.order.indexOf(right.table),
    );
    lines.push(
      `Исполнение: ${sorted.map((operation) => operation.label).join(' → ')}`,
    );
    this.log.innerHTML = lines.map(escape).join('<br>');
  }
}

customElements.define('insert-order-lab', InsertOrderLab);
