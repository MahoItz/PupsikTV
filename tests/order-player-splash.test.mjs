import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup() {
  const source = readFileSync(
    new URL('../script/movies.js', import.meta.url),
    'utf8'
  );
  const ids = Object.fromEntries(
    [
      'orderPlayerFrame',
      'orderPlayerSplash',
      'orderPlayerSplashBackdrop',
      'orderPlayerSplashPoster',
      'orderPlayerSplashPlay',
      'orderPlayerSplashStatus',
    ].map((id) => [
      id,
      { classList: { add() {}, remove() {} }, removeAttribute() {} },
    ])
  );
  const context = vm.createContext({
    document: { getElementById: (id) => ids[id] },
    setOrderPlayerLoading() {},
    KP_FALLBACK_POSTER_PLACEHOLDER: 'fallback.webp',
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(
    source.slice(
      source.indexOf('let orderPlayerSession ='),
      source.indexOf('function populateOrderPlayerSelect')
    ),
    context
  );
  return { ids, run: (code) => vm.runInContext(code, context) };
}

test('poster covers iframe loading and disappears without an extra play button', () => {
  const ui = setup();
  ui.run(
    'resetOrderPlayerSplash(); showOrderPlayerSplash({ poster: "poster.webp" }); applyOrderPlayerUrl("movie")'
  );
  assert.equal(ui.ids.orderPlayerFrame.src, 'movie');
  assert.equal(ui.ids.orderPlayerSplashBackdrop.src, 'poster.webp');
  assert.equal(ui.ids.orderPlayerSplash.hidden, false);
  ui.ids.orderPlayerFrame.onload();
  assert.equal(ui.ids.orderPlayerSplash.hidden, true);
});

test('closing invalidates a late iframe load event', () => {
  const ui = setup();
  ui.run('showOrderPlayerSplash({}); applyOrderPlayerUrl("movie")');
  const oldLoad = ui.ids.orderPlayerFrame.onload;
  ui.run(
    'resetOrderPlayerSplash(); showOrderPlayerSplash({ poster: "next.webp" })'
  );
  oldLoad();
  assert.equal(ui.ids.orderPlayerFrame.src, 'about:blank');
  assert.equal(ui.ids.orderPlayerSplash.hidden, false);
  assert.equal(ui.ids.orderPlayerSplashBackdrop.src, 'next.webp');
});

test('changing translation restores loading artwork until the new iframe loads', () => {
  const ui = setup();
  ui.run('showOrderPlayerSplash({}); applyOrderPlayerUrl("first")');
  ui.ids.orderPlayerFrame.onload();
  ui.run('applyOrderPlayerUrl("second")');
  assert.equal(ui.ids.orderPlayerSplash.hidden, false);
  assert.equal(ui.ids.orderPlayerFrame.src, 'second');
  ui.ids.orderPlayerFrame.onload();
  assert.equal(ui.ids.orderPlayerSplash.hidden, true);
});
