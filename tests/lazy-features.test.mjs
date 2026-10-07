import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/feature-loader.js', import.meta.url),
  'utf8'
);

function setup() {
  const scripts = [];
  const listeners = [];
  const notices = [];
  let initializations = 0;
  const context = vm.createContext({
    console: { error() {} },
    Pupsik: { assetUrl: (path) => `https://example.com/PupsikTV/${path}` },
    document: {
      createElement: () => ({ remove() {} }),
      head: { appendChild: (script) => scripts.push(script) },
      addEventListener: (event, listener) =>
        listeners.push({ event, listener }),
    },
    initAdminFeatures: () => initializations++,
    ensureCatalogLoaded: async () => true,
    showToastNotification: (...args) => notices.push(args),
  });
  context.window = context;
  vm.runInContext(source, context);
  return {
    context,
    scripts,
    notices,
    click: listeners.find(({ event }) => event === 'click').listener,
    initializations: () => initializations,
  };
}

async function completeAdmin(scripts) {
  scripts[0].onload();
  await Promise.resolve();
  scripts[1].onload();
  await Promise.resolve();
  scripts[2].onload();
}

test('startup requests no optional scripts; concurrent admin opens share one initialization', async () => {
  const { context, scripts, initializations } = setup();
  assert.equal(scripts.length, 0);
  const first = context.loadFeature('admin');
  assert.equal(context.loadFeature('admin'), first);
  await completeAdmin(scripts);
  await first;
  assert.equal(initializations(), 1);
  assert.deepEqual(
    scripts.map(({ src }) => src),
    ['admin.js', 'users.js', 'copy-scheduled.js'].map(
      (name) => `https://example.com/PupsikTV/script/${name}`
    )
  );
  await context.loadFeature('admin');
  assert.equal(initializations(), 1);
  assert.equal(scripts.length, 3);
});

test('admin entry point invokes the downloaded implementation with its arguments', async () => {
  const { context, scripts } = setup();
  const result = context.openEditModal(42);
  context.openEditModal = (id) => `opened ${id}`;
  await completeAdmin(scripts);
  assert.equal(await result, 'opened 42');
});

test('a failed optional script can be retried without reloading the page', async () => {
  const { context, scripts } = setup();
  const failed = context.loadFeature('roulette');
  scripts[0].onerror();
  await assert.rejects(failed, /Не удалось загрузить/);
  const retry = context.loadFeature('roulette');
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  await retry;
  assert.equal(
    scripts.every(({ src }) => src.endsWith('/roulette.js')),
    true
  );
});

test('the first roulette click waits for code and is replayed once', async () => {
  const { context, scripts, click } = setup();
  const attributes = new Set();
  let replays = 0;
  const button = {
    id: 'musicMenuButton',
    matches: () => false,
    closest() {
      return this;
    },
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => attributes.delete(name),
    click: () => replays++,
  };
  const event = {
    target: button,
    preventDefault() {},
    stopImmediatePropagation() {},
  };
  click(event);
  click(event);
  assert.equal(scripts.length, 1);
  assert.equal(replays, 0);
  assert.equal(attributes.has('aria-busy'), true);
  scripts[0].onload();
  await context.loadFeature('roulette');
  // Allow the click handler's finally block to clear the busy state.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(replays, 1);
  assert.equal(attributes.has('aria-busy'), false);
  click(event);
  assert.equal(scripts.length, 1);
  assert.equal(replays, 1);
});

test('main HTML includes the loader and excludes optional script tags', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src="script\/feature-loader\.js"/);
  assert.match(html, /src="script\/media-details\.js"/);
  assert.doesNotMatch(
    html,
    /src="script\/(?:admin|roulette|users|copy-scheduled|diagnostic)\.js"/
  );
});
