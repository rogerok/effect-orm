const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class PoolLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <section class="lab-shell" aria-labelledby="pool-lab-title">
        <p class="kicker" id="pool-lab-title">Симулятор · четыре одновременных запроса</p>
        <div class="lab-controls">
          <label>Размер пула: <output>2</output>
            <input type="range" min="1" max="4" value="2" aria-label="Размер пула">
          </label>
          <button type="button">Запустить</button>
        </div>
        <div class="pool-grid" aria-label="Ресурсы пула"></div>
        <div class="request-grid" aria-label="Запросы"></div>
        <div class="lab-log" role="log" aria-live="polite">Выбери размер и запусти.</div>
      </section>`;

    this.range = this.querySelector('input');
    this.output = this.querySelector('output');
    this.button = this.querySelector('button');
    this.poolGrid = this.querySelector('.pool-grid');
    this.requestGrid = this.querySelector('.request-grid');
    this.logElement = this.querySelector('.lab-log');

    this.range.addEventListener('input', () => {
      this.output.value = this.range.value;
      this.renderResources(Number(this.range.value));
    });
    this.button.addEventListener('click', () => this.run());
    this.renderResources(2);
    this.renderRequests([]);
  }

  renderResources(size, leases = new Map()) {
    this.poolGrid.innerHTML = Array.from({ length: size }, (_, index) => {
      const request = leases.get(index);
      const state = request === undefined ? 'idle' : 'busy';
      const label =
        request === undefined ? 'свободен' : `выдан R${request + 1}`;
      return `<div class="resource" data-state="${state}"><strong>Driver ${index + 1}</strong><br>${label}</div>`;
    }).join('');
  }

  renderRequests(states) {
    const normalized = states.length === 0 ? Array(4).fill('ready') : states;
    const labels = {
      ready: 'готов',
      waiting: 'ждёт',
      running: 'работает',
      done: 'завершён',
    };
    this.requestGrid.innerHTML = normalized
      .map(
        (state, index) =>
          `<div class="request" data-state="${state}"><strong>R${index + 1}</strong><br>${labels[state]}</div>`,
      )
      .join('');
  }

  async run() {
    const size = Number(this.range.value);
    const durations = [1050, 820, 640, 520];
    const states = Array(4).fill('waiting');
    const free = Array.from({ length: size }, (_, index) => index);
    const waiting = [0, 1, 2, 3];
    const leases = new Map();
    const startedAt = performance.now();
    const lines = [];

    this.button.disabled = true;
    this.range.disabled = true;
    const log = (message) => {
      const elapsed = Math.round(performance.now() - startedAt);
      lines.push(`${String(elapsed).padStart(4, ' ')} ms  ${message}`);
      this.logElement.textContent = lines.join('\n');
      this.logElement.scrollTop = this.logElement.scrollHeight;
    };
    const paint = () => {
      this.renderResources(size, leases);
      this.renderRequests(states);
    };

    log(`Pool.make: доступно ${size}`);
    paint();

    await new Promise((resolve) => {
      let done = 0;
      const dispatch = () => {
        while (free.length > 0 && waiting.length > 0) {
          const resource = free.shift();
          const request = waiting.shift();
          leases.set(resource, request);
          states[request] = 'running';
          log(`R${request + 1}: Pool.get → Driver ${resource + 1}`);
          paint();

          sleep(durations[request]).then(() => {
            states[request] = 'done';
            leases.delete(resource);
            free.push(resource);
            log(
              `R${request + 1}: scope закрыт → Driver ${resource + 1} возвращён`,
            );
            paint();
            done += 1;
            if (done === 4) resolve();
            else dispatch();
          });
        }
        for (const request of waiting) {
          if (states[request] === 'waiting')
            log(`R${request + 1}: ждёт свободный Driver`);
        }
      };
      dispatch();
    });

    log('Внешний scope ещё открыт: Driver не закрыты, они простаивают в пуле');
    this.button.disabled = false;
    this.range.disabled = false;
  }
}

class PoolMachine extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <section class="lab-shell" aria-labelledby="machine-title">
        <p class="kicker" id="machine-title">Модель состояния · ленивый pool</p>
        <div class="lab-controls">
          <label>max: <output>2</output>
            <input type="range" min="1" max="4" value="2" aria-label="Максимальный размер пула">
          </label>
          <button type="button" data-op="request">Новый checkout</button>
          <button type="button" data-op="release">Вернуть первый</button>
          <button type="button" data-op="break">Сломать первый</button>
          <button type="button" data-op="shutdown">Shutdown</button>
          <button type="button" data-op="reset">Сбросить</button>
        </div>
        <div class="machine-stats" aria-live="polite"></div>
        <div class="pool-grid" aria-label="Внутренние элементы пула"></div>
        <div class="request-grid" aria-label="Очередь ожидающих запросов"></div>
        <div class="lab-log" role="log" aria-live="polite"></div>
      </section>`;

    this.range = this.querySelector('input');
    this.output = this.querySelector('output');
    this.stats = this.querySelector('.machine-stats');
    this.poolGrid = this.querySelector('.pool-grid');
    this.requestGrid = this.querySelector('.request-grid');
    this.logElement = this.querySelector('.lab-log');

    this.range.addEventListener('input', () => {
      this.output.value = this.range.value;
      this.reset();
    });
    this.querySelectorAll('button[data-op]').forEach((button) => {
      button.addEventListener('click', () => this[button.dataset.op]());
    });
    this.reset();
  }

  reset() {
    this.phase = 'open';
    this.nextRequest = 1;
    this.nextResource = 1;
    this.resources = [];
    this.waiters = [];
    this.lines = ['Pool открыт: resources = [], waiters = []'];
    this.render();
  }

  request() {
    const request = `R${this.nextRequest++}`;
    if (this.phase !== 'open') {
      this.lines.push(`${request}: отклонён — pool закрывается`);
      this.render();
      return;
    }

    const idle = this.resources.find((resource) => resource.state === 'idle');
    if (idle) {
      idle.state = 'borrowed';
      idle.holder = request;
      this.lines.push(`${request}: получил idle ${idle.id}`);
    } else if (this.resources.length < Number(this.range.value)) {
      const resource = {
        id: `C${this.nextResource++}`,
        state: 'borrowed',
        holder: request,
      };
      this.resources.push(resource);
      this.lines.push(`${request}: свободных нет, создан ${resource.id}`);
    } else {
      this.waiters.push(request);
      this.lines.push(
        `${request}: capacity исчерпана, добавлен в FIFO waiters`,
      );
    }
    this.render();
  }

  release() {
    const resource = this.resources.find(
      (candidate) => candidate.state === 'borrowed',
    );
    if (!resource) {
      this.lines.push('release: нет выданного ресурса');
      this.render();
      return;
    }

    const previous = resource.holder;
    if (this.phase === 'closing') {
      this.resources = this.resources.filter(
        (candidate) => candidate !== resource,
      );
      this.lines.push(
        `${previous}: вернул ${resource.id}; shutdown уничтожил ресурс`,
      );
    } else if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      resource.holder = next;
      this.lines.push(
        `${previous}: вернул ${resource.id}; прямой handoff → ${next}`,
      );
    } else {
      resource.state = 'idle';
      resource.holder = undefined;
      this.lines.push(`${previous}: вернул ${resource.id}; ресурс стал idle`);
    }
    this.finishShutdownIfDrained();
    this.render();
  }

  break() {
    const resource = this.resources.find(
      (candidate) => candidate.state === 'borrowed',
    );
    if (!resource) {
      this.lines.push('invalidate: нет выданного ресурса');
      this.render();
      return;
    }

    const previous = resource.holder;
    this.resources = this.resources.filter(
      (candidate) => candidate !== resource,
    );
    this.lines.push(`${previous}: ${resource.id} invalidated и уничтожен`);
    if (this.phase === 'open' && this.waiters.length > 0) {
      const next = this.waiters.shift();
      const replacement = {
        id: `C${this.nextResource++}`,
        state: 'borrowed',
        holder: next,
      };
      this.resources.push(replacement);
      this.lines.push(`${next}: создана замена ${replacement.id}`);
    }
    this.finishShutdownIfDrained();
    this.render();
  }

  shutdown() {
    if (this.phase !== 'open') {
      this.lines.push(`shutdown: pool уже ${this.phase}`);
      this.render();
      return;
    }

    this.phase = 'closing';
    const rejected = this.waiters.splice(0);
    const idle = this.resources.filter((resource) => resource.state === 'idle');
    this.resources = this.resources.filter(
      (resource) => resource.state !== 'idle',
    );
    this.lines.push(
      `shutdown: отклонено waiters=${rejected.length}, уничтожено idle=${idle.length}`,
    );
    if (this.resources.length > 0) {
      this.lines.push('borrowed будут уничтожены после возврата');
    }
    this.finishShutdownIfDrained();
    this.render();
  }

  finishShutdownIfDrained() {
    if (this.phase === 'closing' && this.resources.length === 0) {
      this.phase = 'closed';
      this.lines.push('shutdown завершён: все ресурсы уничтожены');
    }
  }

  render() {
    const idle = this.resources.filter(
      (resource) => resource.state === 'idle',
    ).length;
    const borrowed = this.resources.length - idle;
    const max = Number(this.range.value);
    const valid =
      this.resources.length === idle + borrowed && this.resources.length <= max;
    this.stats.innerHTML = `
      <span><b>phase</b> ${this.phase}</span>
      <span><b>total</b> ${this.resources.length}/${max}</span>
      <span><b>idle</b> ${idle}</span>
      <span><b>borrowed</b> ${borrowed}</span>
      <span><b>waiters</b> ${this.waiters.length}</span>
      <span data-valid="${valid}"><b>invariant</b> ${valid ? 'OK' : 'BROKEN'}</span>`;
    this.poolGrid.innerHTML =
      this.resources.length === 0
        ? '<div class="resource">Ресурсов пока нет</div>'
        : this.resources
            .map(
              (resource) => `
          <div class="resource" data-state="${resource.state === 'borrowed' ? 'busy' : 'idle'}">
            <strong>${resource.id}</strong><br>
            ${resource.state === 'borrowed' ? `выдан ${resource.holder}` : 'idle'}
          </div>`,
            )
            .join('');
    this.requestGrid.innerHTML =
      this.waiters.length === 0
        ? '<div class="request">Очередь пуста</div>'
        : this.waiters
            .map(
              (request, index) => `
          <div class="request" data-state="waiting"><strong>${request}</strong><br>позиция ${index + 1}</div>`,
            )
            .join('');
    this.logElement.textContent = this.lines.join('\n');
    this.logElement.scrollTop = this.logElement.scrollHeight;
  }
}

class LearningCheck extends HTMLElement {
  connectedCallback() {
    const buttons = [...this.querySelectorAll('button[data-answer]')];
    const feedback = this.querySelector('.quiz-feedback');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        buttons.forEach((candidate) =>
          candidate.setAttribute('aria-pressed', String(candidate === button)),
        );
        const correct = button.dataset.answer === 'correct';
        feedback.className = `quiz-feedback ${correct ? 'correct' : 'incorrect'}`;
        feedback.textContent = correct
          ? button.dataset.feedback
          : button.dataset.feedback;
      });
    });
  }
}

customElements.define('pool-lab', PoolLab);
customElements.define('pool-machine', PoolMachine);
customElements.define('learning-check', LearningCheck);
