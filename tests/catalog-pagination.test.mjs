import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/data-init.js', import.meta.url),
  'utf8'
);
const catalogs = [
  ['movies', 'movies', 'allMovies', 'loadMoviesFromSupabase', false],
  ['watchlist', 'Movie_Orders', 'watchlist', 'loadWatchlistFromSupabase', true],
  ['gameOrders', 'Game_Orders', 'gameOrders', 'loadGamesFromSupabase', true],
  [
    'playedGames',
    'games',
    'allPlayedGames',
    'loadPlayedGamesFromSupabase',
    false,
  ],
];

function setup({
  size = 1205,
  cap = 1000,
  count = true,
  failOffset,
  detail,
} = {}) {
  const calls = [];
  const saved = new Map();
  const rows = Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    title: `Movie ${index + 1}`,
    order_title: `Order ${index + 1}`,
    game_title: `Game ${index + 1}`,
    description: 'Heavy description',
    actors: ['Actor'],
    studios: { studios: ['Studio'] },
    parents_guide: { violence: 'Guide' },
    platforms: 'Platform',
    developers: 'Developer',
    publishers: 'Publisher',
  }));
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    allMovies: [],
    allPlayedGames: [],
    watchlist: [],
    gameOrders: [],
    moviesLoading: false,
    playedGamesLoading: false,
    watchlistLoading: false,
    gameOrdersLoading: false,
    totalMovies: 0,
    totalGamesPlayed: 0,
    document: { getElementById: () => null, addEventListener() {} },
    localStorage: { setItem: (key, value) => saved.set(key, value) },
    toggleSectionLoading() {},
    renderMovies() {},
    renderWatchlist() {},
    renderGames() {},
    renderPlayedGames() {},
    normalizeWatchSource: (value) => value || '',
    normalizeGameMode: (value) => value || '',
    extractKinopoiskIdFromValue: () => null,
    supabaseClient: {
      from(table) {
        return {
          select(columns, options) {
            const select = columns.split(',').map((column) => column.trim());
            const project = (row) =>
              Object.fromEntries(select.map((column) => [column, row[column]]));
            return {
              order(key, { ascending }) {
                return {
                  async range(from, to) {
                    calls.push({
                      table,
                      select,
                      options,
                      key,
                      ascending,
                      from,
                      to,
                    });
                    if (from === failOffset)
                      return { error: new Error('Offline') };
                    const sorted = ascending ? rows : [...rows].reverse();
                    return {
                      data: sorted
                        .slice(from, from + Math.min(to - from + 1, cap))
                        .map(project),
                      error: null,
                      count:
                        count && options?.count === 'exact'
                          ? rows.length
                          : null,
                    };
                  },
                };
              },
              eq(column, id) {
                return {
                  async single() {
                    calls.push({ table, select, column, id, single: true });
                    return detail
                      ? detail()
                      : {
                          data: project(
                            rows.find((row) => row.id === Number(id))
                          ),
                          error: null,
                        };
                  },
                };
              },
            };
          },
        };
      },
    },
  });
  vm.runInContext(source, context);
  return { context, calls, saved };
}

for (const [catalog, table, list, loader, ascending] of catalogs) {
  test(`${catalog}: loads more than 1000 rows with bounded ordered requests and no heavy fields`, async () => {
    const { context, calls } = setup();
    assert.equal(await context[loader](), true);
    assert.equal(context[list].length, 1205);
    assert.equal(new Set(context[list].map((item) => item.id)).size, 1205);
    assert.equal(calls.length, 7);
    for (const [index, call] of calls.entries()) {
      assert.equal(call.table, table);
      assert.equal(call.key, 'id');
      assert.equal(call.ascending, ascending);
      assert.equal(call.from, index * 200);
      assert.equal(call.to, index * 200 + 199);
      for (const heavy of [
        'description',
        'actors',
        'studios',
        'parents_guide',
        'platforms',
        'developers',
        'publishers',
      ]) {
        assert.equal(call.select.includes(heavy), false);
      }
    }
    assert.equal(calls[0].options.count, 'exact');
    assert.equal(calls[1].options, undefined);
    assert.equal(context[list][0]._detailsLoaded, false);
  });

  test(`${catalog}: a failed later page preserves the previous catalog and cache`, async () => {
    const { context, saved } = setup({ failOffset: 400 });
    const previous = [
      { id: 9000, title: 'Cached', description: 'Cached details' },
    ];
    context[list] = previous;
    saved.set('moviesCache', 'previous movies');
    saved.set('gamesCache', 'previous games');
    assert.equal(await context[loader](), false);
    assert.equal(context[list], previous);
    assert.equal(saved.get('moviesCache'), 'previous movies');
    assert.equal(saved.get('gamesCache'), 'previous games');
  });

  test(`${catalog}: details are fetched once by ID and retained for repeat opens`, async () => {
    const { context, calls } = setup({ size: 3 });
    await context[loader]();
    const first = context.ensureCatalogItemDetails(catalog, 2);
    const second = context.ensureCatalogItemDetails(catalog, 2);
    assert.equal(first, second);
    const item = await first;
    assert.equal(item.description, 'Heavy description');
    assert.equal(item._detailsLoaded, true);
    assert.equal(
      context[list].find((entry) => entry.id === 1)._detailsLoaded,
      false
    );
    await context.ensureCatalogItemDetails(catalog, 2);
    const details = calls.filter((call) => call.single);
    assert.equal(details.length, 1);
    assert.equal(details[0].table, table);
    assert.equal(details[0].column, 'id');
    assert.equal(details[0].id, 2);
  });
}

test('a lower server limit does not skip rows, with or without a count', async () => {
  for (const count of [true, false]) {
    const { context, calls } = setup({ size: 305, cap: 80, count });
    assert.equal(await context.loadMoviesFromSupabase(), true);
    assert.equal(context.allMovies.length, 305);
    assert.deepEqual(
      calls.map((call) => call.from),
      count ? [0, 80, 160, 240] : [0, 80, 160, 240, 305]
    );
  }
});

test('an exact multiple and an empty catalog finish without an extra request when counted', async () => {
  for (const [size, requests] of [
    [0, 1],
    [400, 2],
  ]) {
    const { context, calls } = setup({ size });
    assert.equal(await context.loadMoviesFromSupabase(), true);
    assert.equal(context.allMovies.length, size);
    assert.equal(calls.length, requests);
  }
});

test('summary refresh retains cached details until a successful detail request replaces them', async () => {
  const { context, saved } = setup({ size: 1 });
  context.allMovies = [
    {
      id: 1,
      title: 'Old title',
      description: 'Cached description',
      actors: ['Cached actor'],
    },
  ];
  await context.loadMoviesFromSupabase();
  assert.equal(context.allMovies[0].description, 'Cached description');
  assert.equal(
    JSON.parse(saved.get('moviesCache'))[0].description,
    'Cached description'
  );
  await context.ensureCatalogItemDetails('movies', 1);
  assert.equal(context.allMovies[0].description, 'Heavy description');
  assert.equal(JSON.parse(saved.get('moviesCache'))[0]._detailsLoaded, true);
});

test('detail failure preserves cached fields and allows a retry', async () => {
  let attempts = 0;
  const { context } = setup({
    size: 1,
    detail: () =>
      ++attempts === 1
        ? { error: new Error('Offline') }
        : {
            data: { description: 'Fresh', actors: 'Actor One, Actor Two' },
            error: null,
          },
  });
  context.allMovies = [{ id: 1, description: 'Cached' }];
  await context.loadMoviesFromSupabase();
  await assert.rejects(
    context.ensureCatalogItemDetails('movies', 1),
    /Offline/
  );
  assert.equal(context.allMovies[0].description, 'Cached');
  assert.equal(context.allMovies[0]._detailsLoaded, false);
  await context.ensureCatalogItemDetails('movies', 1);
  assert.equal(context.allMovies[0].description, 'Fresh');
  assert.deepEqual(Array.from(context.allMovies[0].actors), [
    'Actor One',
    'Actor Two',
  ]);
});

test('detail completion updates the current object after a concurrent summary refresh', async () => {
  let finish;
  const { context } = setup({
    size: 1,
    detail: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await context.loadMoviesFromSupabase();
  const original = context.allMovies[0];
  const pending = context.ensureCatalogItemDetails('movies', 1);
  await Promise.resolve();
  await context.loadMoviesFromSupabase();
  assert.notEqual(context.allMovies[0], original);
  finish({ data: { description: 'Fresh details' }, error: null });
  const result = await pending;
  assert.equal(result, context.allMovies[0]);
  assert.equal(result.description, 'Fresh details');
  assert.equal(result.title, 'Movie 1');
});
