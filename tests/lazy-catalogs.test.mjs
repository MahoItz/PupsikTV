import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/data-init.js', import.meta.url),
  'utf8'
);
function setup(width = 390) {
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { innerWidth: width },
    activeTab: 'movies',
    activeListTab: 'movies',
    supabaseClient: {},
    localStorage: { getItem: () => null },
    console,
  });
  vm.runInContext(source, context);
  return context;
}

test('only the selected catalog loads; repeat opens share requests', async () => {
  const context = setup();
  const calls = [];
  for (const [name, catalog] of Object.entries({
    loadMoviesFromSupabase: 'movies',
    loadPlayedGamesFromSupabase: 'playedGames',
    loadWatchlistFromSupabase: 'watchlist',
    loadGamesFromSupabase: 'games',
    loadSettingsFromSupabase: 'settings',
  }))
    context[name] = async () => {
      calls.push(catalog);
      return true;
    };
  await Promise.all([context.loadActiveCatalog(), context.loadActiveCatalog()]);
  assert.deepEqual(calls, ['movies']);
  context.activeListTab = 'games';
  await context.loadActiveCatalog();
  context.activeTab = 'watchlist';
  await context.loadActiveCatalog();
  context.activeTab = 'games';
  await context.loadActiveCatalog();
  context.activeTab = 'movies';
  await context.loadActiveCatalog();
  assert.deepEqual(calls, ['movies', 'playedGames', 'watchlist', 'games']);
  await context.ensureCatalogLoaded('settings');
  await context.ensureCatalogLoaded('settings');
  assert.deepEqual(calls, [
    'movies',
    'playedGames',
    'watchlist',
    'games',
    'settings',
  ]);
});

test('failed requests can be retried on the next open', async () => {
  const context = setup();
  let attempts = 0;
  context.loadMoviesFromSupabase = async () => ++attempts > 1;
  assert.equal(await context.loadActiveCatalog(), false);
  assert.equal(await context.loadActiveCatalog(), true);
  await context.loadActiveCatalog();
  assert.equal(attempts, 2);
});

test('desktop order columns load only when visible', async () => {
  const context = setup(1200);
  let notify;
  const observed = [];
  const calls = [];
  context.document.getElementById = (id) => ({ id });
  context.IntersectionObserver = class {
    constructor(callback) {
      notify = callback;
    }
    observe(node) {
      observed.push(node);
    }
    unobserve() {}
  };
  context.loadMoviesFromSupabase = async () => {
    calls.push('movies');
    return true;
  };
  context.loadWatchlistFromSupabase = async () => {
    calls.push('watchlist');
    return true;
  };
  context.loadGamesFromSupabase = async () => {
    calls.push('games');
    return true;
  };
  context.initVisibleCatalogLoading();
  await context.loadActiveCatalog();
  assert.deepEqual(calls, ['movies']);
  notify(observed.map((target) => ({ target, isIntersecting: false })));
  assert.deepEqual(calls, ['movies']);
  notify([{ target: observed[0], isIntersecting: true }]);
  await context.ensureCatalogLoaded('watchlist');
  assert.deepEqual(calls, ['movies', 'watchlist']);
});
