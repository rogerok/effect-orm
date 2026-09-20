// Учебная модель состояний. Не исполняет SQL и не подключается к ORM.
const transactionSteps = {
  direct: [
    ['Эффекты подготовлены', 0, false, 0, 0, 'SQL ещё не выполнялся.'],
    ['BEGIN', 0, true, 0, 0, 'withTransaction начинает транзакцию.'],
    [
      'INSERT Alice RETURNING id → 42',
      0,
      true,
      1,
      0,
      'id уже доступен внутри бизнес-операции. COMMIT ещё не было.',
    ],
    [
      'INSERT Bob RETURNING id → 43',
      0,
      true,
      2,
      0,
      'Обе вставки выполнены, но ещё могут быть отменены.',
    ],
    [
      'COMMIT',
      0,
      false,
      0,
      2,
      'Изменения зафиксированы. withTransaction возвращает результат бизнес-операции.',
    ],
  ],
  queued: [
    ['UoW создан', 0, false, 0, 0, 'Пустая очередь. Открытой транзакции нет.'],
    [
      'register(вставка Alice)',
      1,
      false,
      0,
      0,
      'В памяти сохранён эффект. INSERT ещё не выполнялся.',
    ],
    [
      'register(вставка Bob)',
      2,
      false,
      0,
      0,
      'Два эффекта в очереди. SQL записи ещё не выполнялся.',
    ],
    [
      'uow.commit → withTransaction → BEGIN',
      2,
      true,
      0,
      0,
      'commit начинает исполнение очереди внутри транзакции.',
    ],
    [
      'INSERT Alice',
      2,
      true,
      1,
      0,
      'Первый эффект выполнен. Массив очереди пока не очищен.',
    ],
    [
      'INSERT Bob',
      2,
      true,
      2,
      0,
      'Второй эффект выполнен. Результаты операций UoW отбрасывает.',
    ],
    [
      'COMMIT',
      2,
      false,
      0,
      2,
      'Транзакция зафиксирована. Следующее действие UoW — очистить очередь.',
    ],
    [
      'Ref.set(stateRef, [])',
      0,
      false,
      0,
      2,
      'Очередь очищена. uow.commit завершился успешно.',
    ],
  ],
  failed: [
    ['UoW создан', 0, false, 0, 0, 'Исходная таблица пуста.'],
    [
      'register(вставка id=42)',
      1,
      false,
      0,
      0,
      'Первая вставка пока только зарегистрирована.',
    ],
    [
      'register(ещё одна вставка id=42)',
      2,
      false,
      0,
      0,
      'Ошибка ещё не возникла: БД пока не исполняла эти записи.',
    ],
    [
      'uow.commit → BEGIN',
      2,
      true,
      0,
      0,
      'withTransaction начинает транзакцию.',
    ],
    [
      'INSERT id=42',
      2,
      true,
      1,
      0,
      'Первая вставка выполнена, но не зафиксирована.',
    ],
    [
      'Второй INSERT → UniqueViolationError',
      2,
      true,
      1,
      0,
      'Основной эффект завершился ошибкой. Изменение первой вставки ещё нужно откатить.',
    ],
    [
      'ROLLBACK',
      2,
      false,
      0,
      0,
      'withTransaction откатил БД. uow.commit завершился ошибкой и не дошёл до очистки очереди.',
    ],
    [
      'Явный uow.rollback',
      0,
      false,
      0,
      0,
      'Теперь приложение отбросило очередь и очистило карту UoW. Это не SQL ROLLBACK.',
    ],
  ],
};

class TransactionLab extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.position = 0;
    this.innerHTML = `
      <div class="lab-shell">
        <div class="lab-controls">
          <label>Сценарий
            <select aria-label="Сценарий транзакции">
              <option value="direct">Репозиторий внутри withTransaction</option>
              <option value="queued">Очередь UoW: успех</option>
              <option value="failed">Очередь UoW: ошибка</option>
            </select>
          </label>
          <button type="button" data-action="back">Назад</button>
          <button type="button" data-action="next">Следующий шаг</button>
          <button type="button" data-action="reset">Сначала</button>
        </div>
        <p class="meta">Учебная модель одного последовательного сценария, не подключение к БД.</p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p class="kicker" data-step></p>
          <p><strong data-title></strong></p>
          <div class="transaction-states">
            <div class="resource"><span>Эффектов в очереди</span><strong data-value="queue"></strong></div>
            <div class="resource"><span>Транзакция</span><strong data-value="transaction"></strong></div>
            <div class="resource"><span>Незафиксированных вставок</span><strong data-value="pending"></strong></div>
            <div class="resource"><span>Зафиксированных строк</span><strong data-value="saved"></strong></div>
          </div>
          <p data-explanation></p>
        </div>
        <pre class="lab-log" aria-label="Последовательность действий"></pre>
      </div>`;
    this.select = this.querySelector('select');
    this.select.addEventListener('change', () => this.reset());
    this.querySelector('[data-action="back"]').addEventListener('click', () =>
      this.move(-1),
    );
    this.querySelector('[data-action="next"]').addEventListener('click', () =>
      this.move(1),
    );
    this.querySelector('[data-action="reset"]').addEventListener('click', () =>
      this.reset(),
    );
    this.render();
  }

  reset() {
    this.position = 0;
    this.render();
  }

  move(delta) {
    const last = transactionSteps[this.select.value].length - 1;
    this.position = Math.max(0, Math.min(last, this.position + delta));
    this.render();
  }

  render() {
    const steps = transactionSteps[this.select.value];
    const [title, queue, open, pending, saved, explanation] =
      steps[this.position];
    this.querySelector('[data-step]').textContent =
      `Шаг ${this.position + 1} из ${steps.length}`;
    this.querySelector('[data-title]').textContent = title;
    this.querySelector('[data-value="queue"]').textContent = queue;
    this.querySelector('[data-value="transaction"]').textContent = open
      ? 'открыта'
      : 'нет';
    this.querySelector('[data-value="pending"]').textContent = pending;
    this.querySelector('[data-value="saved"]').textContent = saved;
    this.querySelector('[data-explanation]').textContent = explanation;
    this.querySelector('.lab-log').textContent = steps
      .slice(0, this.position + 1)
      .map((step, index) => `${index + 1}. ${step[0]}`)
      .join('\n');
    this.querySelector('[data-action="back"]').disabled = this.position === 0;
    this.querySelector('[data-action="next"]').disabled =
      this.position === steps.length - 1;
  }
}

customElements.define('transaction-lab', TransactionLab);
