import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/data-init.js', import.meta.url),
  'utf8'
);

function setup({
  catalog = 'movies',
  client = true,
  cache,
  storageError = false,
} = {}) {
  const events = [];
  const refreshes = [];
  const cacheReads = [];
  const loading = [];
  let startup;
  let resolveEnv;
  const cacheKey = catalog === 'movies' ? 'moviesCache' : 'gamesCache';
  const grids = {
    moviesGrid: { children: [] },
    gamesGridPlayed: { children: [] },
  };
  const cached =
    cache ??
    JSON.stringify([{ id: 1, title: 'Cached', ratingSum: 16, ratingCount: 2 }]);
  const supabaseClient = {
    from(table) {
      events.push(`api:${table}`);
      return {
        select: () => ({
          order: () => new Promise((resolve) => refreshes.push(resolve)),
        }),
      };
    },
  };
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    window: { innerWidth: 390 },
    activeTab: 'movies',
    activeListTab: catalog === 'movies' ? 'movies' : 'games',
    allMovies: [],
    allPlayedGames: [],
    ratedMovies: {},
    ratedGames: {},
    totalMovies: 0,
    totalGamesPlayed: 0,
    moviesLoading: false,
    playedGamesLoading: false,
    supabaseClient: client ? supabaseClient : null,
    selectedKpApiValue: 'API 1',
    localStorage: {
      getItem(key) {
        if (key !== 'moviesCache' && key !== 'gamesCache') return null;
        cacheReads.push(key);
        if (storageError) throw new Error('Storage unavailable');
        return key === cacheKey ? cached : null;
      },
      setItem() {},
      removeItem() {},
    },
    document: {
      addEventListener(_event, handler) {
        startup = handler;
      },
      getElementById: (id) => grids[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({}),
      body: { appendChild() {} },
    },
    loadEnv() {
      events.push('env');
      return new Promise((resolve) => {
        resolveEnv = resolve;
      });
    },
    restoreAdminSession() {},
    hideAdminControls() {},
    applyKpApiSelection() {},
    updateTabVisibility() {},
    updateListVisibility() {},
    showListTab() {
      void context.loadActiveCatalog();
    },
    normalizeWatchSource: (value) => value || '',
    normalizeGameMode: (value) => value || '',
    toggleSectionLoading(_grid, enabled) {
      loading.push(enabled);
    },
    showFatalErrorBanner() {},
  });
  for (const [name, list, grid] of [
    ['renderMovies', 'allMovies', 'moviesGrid'],
    ['renderPlayedGames', 'allPlayedGames', 'gamesGridPlayed'],
  ]) {
    context[name] = () => {
      events.push(`render:${context[list][0]?.title}`);
      grids[grid].children = context[list].map(() => ({
        classList: { contains: () => false },
      }));
    };
  }
  vm.runInContext(source, context);
  return {
    context,
    events,
    refreshes,
    cacheReads,
    loading,
    startup: () => startup(),
    resolveEnv: () => resolveEnv({ TMDB_ENABLED: false }),
    supabaseClient,
  };
}

for (const catalog of ['movies', 'playedGames']) {
  test(`${catalog}: cache renders synchronously before environment or catalog requests`, async () => {
    const { context, events, refreshes, cacheReads, loading, startup } = setup({
      catalog,
    });
    const started = startup();
    assert.deepEqual(events, ['render:Cached', 'env']);
    assert.deepEqual(cacheReads, [
      catalog === 'movies' ? 'moviesCache' : 'gamesCache',
    ]);
    const list =
      catalog === 'movies' ? context.allMovies : context.allPlayedGames;
    assert.equal(list[0].userRating, 8);
    await started;
    assert.equal(refreshes.length, 1);
    assert.equal(
      loading[0],
      false,
      'background refresh must leave cached cards usable'
    );
    refreshes[0]({ data: null, error: new Error('Offline') });
    assert.equal(await context.loadActiveCatalog(), false);
    assert.equal(list[0].title, 'Cached');
    assert.equal(events.at(-1), 'render:Cached');
  });
}

test('cached cards render even when the Supabase client is unavailable', async () => {
  const { context, events, startup, resolveEnv, supabaseClient, refreshes } =
    setup({ client: false });
  await startup();
  assert.deepEqual(events, ['render:Cached', 'env']);
  assert.equal(await context.loadActiveCatalog(), false);
  context.supabaseClient = supabaseClient;
  resolveEnv();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    refreshes.length,
    1,
    'configuration recovery should start the refresh'
  );
});

test('fresh API data replaces the cache while the environment request is still pending', async () => {
  const { context, events, refreshes, startup } = setup();
  await startup();
  refreshes[0]({
    data: [{ id: 1, title: 'Fresh', rating_sum: 18, rating_count: 2 }],
    error: null,
  });
  assert.equal(await context.loadActiveCatalog(), true);
  assert.equal(context.allMovies[0].title, 'Fresh');
  assert.equal(context.allMovies[0].userRating, 9);
  assert.equal(events.at(-1), 'render:Fresh');
});

test('retrying a failed refresh does not reread the cache or discard local edits', async () => {
  const { context, cacheReads, refreshes, startup } = setup();
  await startup();
  refreshes[0]({ error: new Error('Offline') });
  await context.loadActiveCatalog();
  context.allMovies[0].title = 'Edited';
  const retry = context.loadActiveCatalog();
  assert.equal(context.allMovies[0].title, 'Edited');
  await Promise.resolve();
  refreshes[1]({ error: new Error('Still offline') });
  await retry;
  assert.deepEqual(cacheReads, ['moviesCache']);
  assert.equal(context.allMovies[0].title, 'Edited');
});

for (const options of [
  { cache: '{invalid' },
  { cache: '{}' },
  { storageError: true },
]) {
  test(`unusable cache does not stop API loading: ${JSON.stringify(options)}`, async () => {
    const { context, refreshes, startup, loading } = setup(options);
    await startup();
    assert.equal(loading[0], true);
    refreshes[0]({ data: [{ id: 1, title: 'Fresh' }], error: null });
    assert.equal(await context.loadActiveCatalog(), true);
    assert.equal(context.allMovies[0].title, 'Fresh');
  });
}
