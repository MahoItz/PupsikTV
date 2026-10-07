import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class Element {
  children = [];
  attrs = {};
  style = {};
  dataset = {};
  listeners = {};
  value = '';
  classList = { add() {} };
  setAttribute(key, value) {
    this.attrs[key] = value;
  }
  removeAttribute(key) {
    delete this.attrs[key];
  }
  append(...items) {
    this.children.push(...items);
  }
  prepend(item) {
    this.children.unshift(item);
  }
  replaceChildren(...items) {
    this.children = items;
    this.textContent = '';
  }
  addEventListener(key, fn) {
    (this.listeners[key] ||= []).push(fn);
  }
  emit(key, event = {}) {
    this.listeners[key]?.forEach((fn) => fn(event));
  }
  contains(target) {
    return (
      this === target || this.children.some((child) => child.contains(target))
    );
  }
  closest() {
    return this.className === 'autocomplete-option' ? this : null;
  }
  scrollIntoView() {}
}

function setup(search) {
  const document = new Element();
  document.createElement = () => new Element();
  const context = {
    window: {},
    document,
    console: { error() {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    readFileSync(new URL('../script/media-search.js', import.meta.url), 'utf8'),
    context
  );
  const input = new Element();
  const list = new Element();
  list.id = 'results';
  const container = new Element();
  container.append(list);
  const button = new Element();
  const selected = [];
  const component = context.window.PupsikMediaSearch.create({
    input,
    list,
    container,
    button,
    search,
    onSelect: (item) => selected.push(item),
  });
  const key = (key) => input.emit('keydown', { key, preventDefault() {} });
  return {
    input,
    list,
    container,
    button,
    selected,
    component,
    key,
    document,
    status: container.children[0],
  };
}

test('movie and game results share metadata, keyboard and mouse selection', async () => {
  const movie = {
    nameRu: 'Local',
    nameEn: 'Original',
    year: 2020,
    posterUrlPreview: 'movie.webp',
  };
  const game = {
    name: 'Game',
    released: '2021-01-01',
    background_image: 'game.webp',
  };
  const ui = setup(async () => [movie, game]);
  await ui.component.run('title');
  assert.equal(ui.list.children[0].children[0].src, 'movie.webp');
  assert.ok(
    ui.list.children[0].children[1].children[1].textContent.includes('Original')
  );
  assert.equal(ui.list.children[1].children[0].src, 'game.webp');
  assert.equal(ui.list.children[1].children[1].children[1].textContent, '2021');
  ui.key('ArrowUp');
  assert.equal(ui.input.attrs['aria-activedescendant'], 'results-option-1');
  ui.key('ArrowDown');
  assert.equal(ui.input.attrs['aria-activedescendant'], 'results-option-0');
  ui.key('Enter');
  assert.equal(ui.selected[0], movie);
  assert.equal(ui.input.value, 'Local');
  assert.equal(ui.input.attrs['aria-expanded'], 'false');
  await ui.component.run('game');
  ui.list.emit('click', { target: ui.list.children[1] });
  assert.equal(ui.selected[1], game);
  assert.equal(ui.input.value, 'Game');
});

test('loading uses a spinner and empty/error states are distinct', async () => {
  let resolve;
  const ui = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const pending = ui.component.run('title');
  assert.equal(ui.status.children[0].className, 'loading-spinner');
  assert.equal(ui.input.attrs['aria-busy'], 'true');
  resolve([]);
  await pending;
  assert.match(ui.status.textContent, /Ничего не найдено/);
  assert.equal(ui.list.hidden, true);
  assert.equal(ui.input.attrs['aria-busy'], 'false');
  const failed = setup(async () => {
    throw new Error('offline');
  });
  await failed.component.run('title');
  assert.match(failed.status.textContent, /Ошибка поиска/);
});

test('Escape, outside click and a newer query discard pending results', async () => {
  const requests = [];
  const ui = setup(() => new Promise((resolve) => requests.push(resolve)));
  const first = ui.component.run('first');
  ui.key('Escape');
  requests[0]([{ name: 'Old' }]);
  await first;
  assert.equal(ui.container.style.display, 'none');
  const old = ui.component.run('old');
  const recent = ui.component.run('recent');
  requests[2]([{ name: 'Recent' }]);
  await recent;
  requests[1]([{ name: 'Old' }]);
  await old;
  assert.equal(
    ui.list.children[0].children[1].children[0].textContent,
    'Recent'
  );
  ui.document.emit('click', { target: new Element() });
  assert.equal(ui.input.attrs['aria-expanded'], 'false');
  await ui.component.run('');
  assert.equal(ui.container.style.display, 'none');
  assert.equal(ui.list.children.length, 0);
});

test('Escape cancels the debounce before it sends a request', async () => {
  let calls = 0;
  const ui = setup(async () => {
    calls++;
    return [];
  });
  ui.input.value = 'title';
  ui.input.emit('input');
  ui.key('Escape');
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(calls, 0);
  assert.equal(ui.container.style.display, 'none');
});
