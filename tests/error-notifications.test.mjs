import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/toast.js', import.meta.url),
  'utf8'
);

function setup({ bodyReady = true } = {}) {
  let now = 100000;
  let nextTimer = 0;
  const timers = new Map();
  const listeners = new Map();
  class Element {
    children = [];
    attrs = {};
    style = { setProperty() {}, removeProperty() {} };
    classList = { add() {} };
    textContent = '';
    constructor(tag) {
      this.tagName = tag.toUpperCase();
    }
    append(...children) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }
    appendChild(child) {
      this.append(child);
    }
    prepend(child) {
      child.parent = this;
      this.children.unshift(child);
    }
    hasChildNodes() {
      return Boolean(this.children.length);
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (child) => child !== this
        );
    }
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
    addEventListener(name, callback) {
      this[name] = callback;
    }
    getBoundingClientRect() {
      return { height: 64 };
    }
  }
  const body = new Element('body');
  function find(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const result = find(child, id);
      if (result) return result;
    }
    return null;
  }
  function listen(name, callback) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(callback);
  }
  const context = vm.createContext({
    console: { error() {} },
    navigator: { onLine: true },
    location: { href: 'https://example.com/', origin: 'https://example.com' },
    URL,
    Pupsik: {},
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    requestAnimationFrame: (callback) => callback(),
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: listen,
    document: {
      body: bodyReady ? body : null,
      documentElement: new Element('html'),
      createElement: (tag) => new Element(tag),
      getElementById: (id) => find(body, id),
      addEventListener: listen,
    },
  });
  context.window = context;
  vm.runInContext(source, context);
  const emit = (name, event = {}) =>
    listeners.get(name)?.forEach((listener) => listener(event));
  const notices = () => find(body, 'toastContainer')?.children || [];
  const messages = () =>
    notices().map((toast) => toast.children[0].textContent);
  function tick(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  }
  return {
    context,
    body,
    emit,
    notices,
    messages,
    tick,
    banner: () => find(body, 'siteProblemBanner'),
  };
}

test('error bursts are deduplicated, expire, and never exceed two visible notices', () => {
  const ui = setup();
  for (let i = 0; i < 100; i++)
    ui.context.showToastNotification('Failed', 'error');
  assert.equal(ui.notices().length, 1);
  ui.context.showToastNotification('Copied', 'success');
  ui.context.showToastNotification('Other failure', 'error');
  assert.deepEqual(ui.messages(), ['Failed', 'Other failure']);
  ui.tick(8000);
  assert.equal(ui.notices().length, 0);
  ui.context.showToastNotification('Failed', 'error');
  assert.equal(ui.notices().length, 0);
  ui.tick(22000);
  ui.context.showToastNotification('Failed', 'error');
  assert.equal(ui.notices().length, 1);
  ui.notices()[0].children[1].click();
  assert.equal(ui.notices().length, 0);
});

test('critical failures share one banner and clear only after their own recovery', () => {
  const ui = setup();
  const problems = ui.context.PupsikProblems;
  problems.report(
    'movies',
    'Фильмы недоступны.',
    { status: 503 },
    { critical: true }
  );
  const banner = ui.banner();
  problems.report('games', 'Игры недоступны.', null, { critical: true });
  assert.equal(ui.banner(), banner);
  assert.match(banner.textContent, /Фильмы.*HTTP 503.*Игры/);
  problems.clear('movies');
  assert.doesNotMatch(ui.banner().textContent, /Фильмы/);
  problems.clear('games');
  assert.equal(ui.banner(), null);
});

test('offline suppresses secondary toasts; online clears only the offline problem', () => {
  const ui = setup();
  ui.context.navigator.onLine = false;
  ui.emit('offline');
  ui.context.PupsikProblems.report(
    'search',
    'Поиск недоступен.',
    new Error('Failed to fetch')
  );
  assert.equal(ui.notices().length, 0);
  assert.match(ui.banner().textContent, /Нет подключения/);
  ui.context.PupsikProblems.report('movies', 'Фильмы недоступны.', null, {
    critical: true,
  });
  ui.context.navigator.onLine = true;
  ui.emit('online');
  assert.doesNotMatch(ui.banner().textContent, /Нет подключения/);
  assert.match(ui.banner().textContent, /Фильмы/);
  assert.match(ui.messages()[0], /Повторите незавершённое действие/);
});

test('startup resource failures survive a missing body without duplicate banners', () => {
  const ui = setup({ bodyReady: false });
  for (let i = 0; i < 3; i++)
    ui.emit('error', { target: { tagName: 'SCRIPT', dataset: {} } });
  ui.context.document.body = ui.body;
  ui.emit('DOMContentLoaded');
  assert.match(ui.banner().textContent, /кода сайта/);
  assert.equal(
    ui.body.children.filter((element) => element.id === 'siteProblemBanner')
      .length,
    1
  );
  assert.equal(ui.notices().length, 0);
});

test('cancelled requests and opaque third-party errors stay silent', () => {
  const ui = setup();
  ui.emit('unhandledrejection', { reason: { name: 'AbortError' } });
  ui.emit('error', {
    target: ui.context,
    filename: 'https://other.example/embed.js',
    error: new Error('Third-party'),
  });
  ui.emit('error', {
    target: { tagName: 'SCRIPT', dataset: { optionalFeature: 'true' } },
  });
  assert.equal(ui.notices().length, 0);
  assert.equal(ui.banner(), null);
});

test('HTTP, timeout and permission errors are actionable without leaking server payloads', () => {
  const ui = setup();
  const describe = ui.context.PupsikProblems.describe;
  assert.match(describe({ status: 401 }), /Войдите заново/);
  assert.match(describe({ code: '42501' }), /отказал в доступе/);
  assert.match(describe({ status: 429 }), /лимит/);
  assert.match(describe({ name: 'TimeoutError' }), /не ответил вовремя/);
  assert.match(describe({ name: 'SyntaxError' }), /некорректные данные/);
  assert.match(describe(new Error('Failed to fetch')), /Проверьте сеть/);
  ui.context.PupsikProblems.report(
    'save',
    'Не удалось сохранить.',
    new Error('<script>secret-token</script> internal SQL')
  );
  assert.doesNotMatch(ui.messages().join(), /secret-token|script|SQL/);
  assert.equal(
    ui.notices()[0].children[0].textContent,
    'Не удалось сохранить. Повторите попытку позже.'
  );
});
