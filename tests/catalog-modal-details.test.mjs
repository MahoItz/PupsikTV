import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/modals.js', import.meta.url),
  'utf8'
);
const helpers = source.slice(
  source.indexOf('function setDetailsModalContext('),
  source.indexOf('function getRecordByType(')
);

function setup() {
  const pending = [];
  const rendered = [];
  const notices = [];
  const attributes = new Map();
  const modal = {
    dataset: {},
    style: { display: 'block' },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
  };
  const context = vm.createContext({
    console: { warn() {} },
    ensureCatalogItemDetails: () =>
      new Promise((resolve, reject) => pending.push({ resolve, reject })),
    showToastNotification: (...args) => notices.push(args),
  });
  vm.runInContext(helpers, context);
  const open = (id) => {
    const item = { id, _detailsLoaded: false };
    context.setDetailsModalContext(modal, 'movie', id);
    context.refreshCatalogModalDetails('movies', item, modal, (updated) =>
      rendered.push(updated)
    );
  };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { open, modal, attributes, pending, rendered, notices, flush };
}

test('late details from an earlier card do not overwrite a newer card or its loading state', async () => {
  const state = setup();
  state.open(1);
  state.open(2);
  state.pending[0].resolve({ id: 1 });
  await state.flush();
  assert.deepEqual(state.rendered, []);
  assert.equal(state.attributes.get('aria-busy'), 'true');
  state.pending[1].resolve({ id: 2 });
  await state.flush();
  assert.deepEqual(state.rendered, [{ id: 2 }]);
  assert.equal(state.attributes.has('aria-busy'), false);
});

test('a detail response never reopens a closed modal', async () => {
  const state = setup();
  state.open(1);
  state.modal.style.display = 'none';
  state.pending[0].resolve({ id: 1 });
  await state.flush();
  assert.deepEqual(state.rendered, []);
  assert.equal(state.modal.style.display, 'none');
});

test('reopening the same card renders only the current request context', async () => {
  const state = setup();
  state.open(1);
  state.open(1);
  state.pending[0].resolve({ id: 1, description: 'Earlier' });
  state.pending[1].resolve({ id: 1, description: 'Current' });
  await state.flush();
  assert.deepEqual(state.rendered, [{ id: 1, description: 'Current' }]);
});

test('detail errors leave the card open and display a retry message only for the current card', async () => {
  const state = setup();
  state.open(1);
  state.open(2);
  state.pending[0].reject(new Error('Earlier failure'));
  await state.flush();
  assert.deepEqual(state.notices, []);
  state.pending[1].reject(new Error('Current failure'));
  await state.flush();
  assert.equal(state.notices.length, 1);
  assert.equal(state.notices[0][1], 'error');
  assert.equal(state.modal.style.display, 'block');
  assert.equal(state.attributes.has('aria-busy'), false);
});
