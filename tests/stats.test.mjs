import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/stats.js', import.meta.url),
  'utf8'
);

function setup({
  timers = { setTimeout, clearTimeout },
  document = {},
  window = {},
} = {}) {
  const context = vm.createContext({
    Intl,
    Date,
    AbortController,
    ...timers,
    document,
    window,
    console: { error() {} },
  });
  vm.runInContext(
    source.replace(
      /document\.addEventListener\('DOMContentLoaded',[\s\S]*?\n\}\)\(\);\s*$/,
      `globalThis.stats = { numeric, rating, dayOf, distribution, buildRatings, buildLeaders, history, buildActivity, buildQueue, buildGenres, buildDisagreements, computeStats, fetchDataset, loadStatsData, DATASETS, renderAll, state, refresh, renderLeaders };\n})();`
    ),
    context
  );
  assert.ok(context.stats, 'Test seam must replace the page entry point');
  return context.stats;
}

const now = new Date('2026-10-26T10:00:00Z');
const today = Date.UTC(2026, 9, 26);
const day = (offset) =>
  new Date(today + offset * 86400000).toISOString().slice(0, 10);
const emptyData = () => ({
  movies: [],
  games: [],
  movieOrders: [],
  gameOrders: [],
  ratings: [],
  legacyCount: 0,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test('ratings distinguish an actual zero from missing, malformed and out-of-range scores', () => {
  const api = setup();
  const items = [
    null,
    undefined,
    '',
    ' ',
    false,
    'null',
    -1,
    12,
    Infinity,
    NaN,
    0,
    '8.5',
  ].map((rating_numeric, id) => ({ id, rating_numeric }));
  const result = api.buildRatings(items, [], 'Movie');
  assert.deepEqual(plain(result.pupsik), [0, 8.5]);
  assert.equal(result.pupsikAverage, 4.25);
  assert.equal(
    result.pupsikDistribution.reduce((sum, [, count]) => sum + count, 0),
    2
  );
  assert.equal(api.buildRatings([], [], 'Movie').mode, null);
  assert.equal(api.buildRatings([], [], 'Movie').pupsikAverage, null);
  assert.equal(api.buildRatings([], [], 'Movie').viewerAverage, null);
});

test('viewer chart, average, coverage and disagreements use the same linked category-specific votes', () => {
  const api = setup();
  const movie = {
    id: 1,
    title: 'Movie',
    rating_numeric: 8,
    rating_count: 10,
    rating_sum: 90,
  };
  const votes = [
    { movie_id: 1, category: 'Movie', rating: 0 },
    { movie_id: 1, category: 'Movie', rating: 10.5 },
    { movie_id: 1, category: 'Games', rating: 11 },
    { movie_id: 999, category: 'Movie', rating: 11 },
    { movie_id: 1, category: null, rating: 11 },
    { movie_id: 1, category: 'Movie', rating: null },
  ];
  const result = api.buildRatings([movie], votes, 'Movie');
  assert.deepEqual(plain(result.viewerValues), [0, 10.5]);
  assert.equal(result.viewerAverage, 5.25);
  assert.equal(
    result.viewerDistribution.reduce((sum, [, count]) => sum + count, 0),
    2
  );
  assert.equal(result.ratedCount, 1);
  assert.equal(result.orphanVotes, 1);
  assert.equal(result.invalidVotes, 1);
  assert.equal(result.savedCount, 10);
  assert.equal(result.savedAverage, 9);
  assert.equal(result.mismatches, 1);
  assert.equal(api.buildDisagreements(result, 3).length, 0);
  assert.equal(api.buildDisagreements(result, 2)[0].difference, 2.75);
  assert.equal(
    movie.rating_sum,
    90,
    'Historical totals must not be overwritten'
  );
  assert.equal(
    api.buildRatings([movie], undefined, 'Movie').viewerDistribution,
    null
  );
});

test('activity includes both boundaries, excludes undated/future entries, and compares equal adjacent periods', () => {
  const api = setup();
  const data = emptyData();
  data.movies = [-60, -59, -30, -29, 0, 1].map((offset) => ({
    date: day(offset),
  }));
  data.movies.push({ date: null }, { date: '2026-02-30' });
  data.games = [{ date: day(-5) }];
  const result = api.buildActivity(data, 'all', '30', today);
  assert.equal(result.total, 3);
  assert.equal(result.previous, 2);
  assert.equal(result.change, 50);
  assert.equal(result.missing, 2);
  assert.equal(result.future, 1);
  assert.equal(result.buckets.length, 30);
  assert.equal(
    result.buckets.reduce(
      (sum, bucket) => sum + bucket.movies + bucket.games,
      0
    ),
    3
  );
  assert.equal(api.buildActivity(data, 'games', '30', today).total, 1);
  assert.equal(api.buildActivity({ movies: [] }, 'all', '30', today), null);
  assert.equal(
    api.buildActivity({ movies: [] }, 'movies', '30', today).total,
    0
  );
});

test('weekly and monthly buckets preserve totals across year/leap-day boundaries and partial months', () => {
  const api = setup();
  const data = emptyData();
  data.movies = [
    { date: '2023-12-31' },
    { date: '2024-02-29' },
    { date: '2024-03-01' },
  ];
  const end = Date.UTC(2024, 2, 1);
  for (const period of ['90', '365', 'all']) {
    const result = api.buildActivity(data, 'all', period, end);
    assert.equal(result.total, 3);
    assert.equal(
      result.buckets.reduce((sum, bucket) => sum + bucket.movies, 0),
      3
    );
    assert.equal(result.buckets.at(-1).games, 0);
  }
  const result = api.buildActivity(data, 'all', 'all', end);
  assert.equal(result.buckets.length, 4);
  assert.equal(result.previous, null);
  assert.equal(api.buildActivity(emptyData(), 'all', '30', today).change, null);
});

test('queue waiting times use Moscow calendar days and reject future/invalid creation dates', () => {
  const api = setup();
  const result = api.buildQueue(
    [
      {
        game_title: 'Oldest',
        created_at: '2026-10-23T22:30:00Z',
        streams_completed: 2,
      },
      {
        game_title: 'New',
        created_at: '2026-10-25T23:00:00Z',
        streams_completed: 5,
      },
      { created_at: null, streams_completed: 0 },
      { created_at: '2026-10-27T10:00:00Z', streams_completed: -1 },
    ],
    'games',
    today
  );
  assert.equal(result.median, 1);
  assert.equal(result.oldestAge, 2);
  assert.equal(result.oldestTitle, 'Oldest');
  assert.equal(result.invalidDates, 2);
  assert.equal(result.inProgress, 2);
  assert.equal(result.streams, 7);
  assert.equal(
    api.computeStats(emptyData(), new Date('2026-10-25T22:00:00Z')).today,
    today
  );
  assert.equal(api.buildQueue([], 'movies', today).median, null);
});

test('genre aliases merge across languages and each genre counts at most once per title', () => {
  const api = setup();
  const result = api.buildGenres([
    { genres: 'Comedy, комедия, Drama' },
    { genres: 'драма; COMEDY' },
    { genres: ['Action', 'Боевик'] },
    { genres: null },
  ]);
  assert.equal(result.covered, 3);
  assert.equal(result.total, 4);
  assert.deepEqual(Object.fromEntries(result.counts), {
    Драма: 2,
    Комедия: 2,
    Боевик: 1,
  });
});

test('leaderboards normalize case and whitespace, exclude empty names, and require complete sources', () => {
  const api = setup();
  const data = emptyData();
  data.movies = [
    { order_by: ' Player  One ', order_type: 'донат' },
    { order_by: 'null' },
  ];
  data.gameOrders = [
    { game_order_by: 'player one', game_order_type: 'Рулетка' },
    { game_order_by: 'undefined' },
  ];
  const entries = api.history(data, 'all');
  const leaders = api.buildLeaders(entries);
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0].total, 2);
  assert.equal(leaders[0].movies, 1);
  assert.equal(leaders[0].games, 1);
  assert.equal(entries[0].type, 'Донат');
  delete data.games;
  assert.equal(api.history(data, 'all'), null);
  assert.notEqual(api.history(data, 'movies'), null);
});

function mockClient({
  size = 2110,
  cap = 200,
  count = true,
  failTable,
  failOffset,
  emptyOffset,
  repeatOffset,
  stallTable,
} = {}) {
  const calls = [];
  const rows = Array.from({ length: size }, (_, id) => ({
    id: id + 1,
    movie_id: 1,
    rating: 8,
    category: 'Movie',
  }));
  return {
    calls,
    from(table) {
      let options;
      const query = {
        select(columns, opts) {
          options = opts;
          calls.push({ table, columns, options });
          return query;
        },
        in(column, values) {
          assert.equal(column, 'category');
          assert.deepEqual(plain(values), ['Movie', 'Games']);
          return query;
        },
        is(column, value) {
          assert.equal(column, 'category');
          assert.equal(value, null);
          return query;
        },
        order(column, opts) {
          assert.equal(column, 'id');
          assert.equal(opts.ascending, true);
          return query;
        },
        range(from, to) {
          query.from = from;
          query.to = to;
          return query;
        },
        async abortSignal(signal) {
          calls.at(-1).signal = signal;
          calls.at(-1).from = query.from;
          if (table === stallTable) return new Promise(() => {});
          if (
            table === failTable ||
            (failOffset !== undefined && query.from === failOffset)
          )
            return { error: new Error('Offline') };
          if (options?.head) return { count: 952, error: null };
          const offset = query.from === repeatOffset ? 0 : query.from;
          return {
            data:
              query.from === emptyOffset
                ? []
                : rows.slice(
                    offset,
                    offset + Math.min(cap, query.to - query.from + 1)
                  ),
            count: count && options?.count ? size : null,
            error: null,
          };
        },
      };
      return query;
    },
  };
}

test('pagination loads every vote beyond 1000 using bounded, stable requests and minimal public fields', async () => {
  const api = setup();
  const client = mockClient();
  const rows = await api.fetchDataset(client, api.DATASETS.ratings);
  assert.equal(rows.length, 2110);
  assert.equal(new Set(rows.map((row) => row.id)).size, 2110);
  assert.equal(client.calls.length, 11);
  assert.equal(client.calls[0].options.count, 'exact');
  assert.equal(client.calls[1].options, undefined);
  assert.equal(client.calls[1].from, 200);
  for (const call of client.calls) {
    assert.equal(call.columns.includes('user_id'), false);
    assert.equal(call.columns.includes('meta'), false);
  }
});

test('pagination handles smaller server caps and missing totals without truncation', async () => {
  const api = setup();
  for (const count of [true, false]) {
    const client = mockClient({ size: 1003, cap: 73, count });
    assert.equal(
      (await api.fetchDataset(client, api.DATASETS.movies)).length,
      1003
    );
    assert.equal(client.calls[1].from, 73);
  }
});

test('incomplete, failed or repeated pages reject the whole dataset', async () => {
  const api = setup();
  for (const option of [
    { failOffset: 400 },
    { emptyOffset: 400 },
    { repeatOffset: 400 },
  ]) {
    await assert.rejects(
      api.fetchDataset(mockClient(option), api.DATASETS.movies)
    );
  }
});

test('one failed table leaves the other datasets usable and does not fabricate a zero', async () => {
  const api = setup();
  const result = await api.loadStatsData(
    mockClient({ size: 3, failTable: 'ratings' })
  );
  assert.deepEqual(plain(result.errors), ['ratings', 'legacyCount']);
  assert.equal(result.data.movies.length, 3);
  assert.equal(Object.hasOwn(result.data, 'ratings'), false);
  const model = api.computeStats(result.data, now);
  assert.equal(model.ratings.movies.viewerDistribution, null);
  assert.equal(model.ratings.movies.pupsik.length, 0);
  assert.equal(model.queues.movies.count, 3);
});

test('timeout aborts outstanding requests and clears timers, even when a client never settles', async () => {
  const scheduled = [];
  const cleared = [];
  const api = setup({
    timers: {
      setTimeout(callback) {
        scheduled.push(callback);
        return scheduled.length;
      },
      clearTimeout(id) {
        cleared.push(id);
      },
    },
  });
  const client = mockClient({ stallTable: 'movies' });
  const pending = api.fetchDataset(client, api.DATASETS.movies);
  scheduled[0]();
  await assert.rejects(pending, /timed out/);
  assert.equal(client.calls[0].signal.aborted, true);
  assert.deepEqual(cleared, [1]);
});

function fakeDocument() {
  class Node {
    children = [];
    style = { setProperty() {} };
    attributes = {};
    textContent = '';
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = nodes;
    }
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    set innerHTML(value) {
      throw new Error(`Unsafe HTML sink: ${value}`);
    }
  }
  const elements = new Map();
  return {
    elements,
    createElement: () => new Node(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Node());
      return elements.get(id);
    },
  };
}

test('rendering treats database strings as literal text and keeps one useful chart on partial failure', () => {
  const document = fakeDocument();
  const api = setup({ document });
  const unsafe = '<img src=x onerror=alert(1)>';
  api.state.data = {
    ...emptyData(),
    movies: [
      {
        id: 1,
        title: unsafe,
        order_by: unsafe,
        order_type: unsafe,
        genres: unsafe,
        rating_numeric: 8,
        date: '2026-10-01',
      },
    ],
    ratings: [1, 2, 3, 4, 5].map((id) => ({
      id,
      movie_id: 1,
      category: 'Movie',
      rating: 1,
    })),
  };
  api.renderAll();
  const texts = [];
  function visit(node) {
    if (node.textContent) texts.push(node.textContent);
    node.children.forEach(visit);
  }
  for (const node of document.elements.values()) visit(node);
  assert.ok(texts.filter((value) => value === unsafe).length >= 3);
  delete api.state.data.ratings;
  api.renderAll();
  assert.equal(document.elements.get('statsOverview').children.length, 5);
  assert.equal(document.elements.get('ratingDistribution').children.length, 12);
  assert.equal(
    document.elements
      .get('disagreements')
      .children[0].textContent.includes('недоступны'),
    true
  );
});

test('a failed refresh retains complete prior votes and a retry recovers without resetting controls', async () => {
  const document = fakeDocument();
  const healthy = mockClient({ size: 3 });
  const failing = mockClient({ size: 3, failTable: 'ratings' });
  let offline = false;
  const client = { from: (table) => (offline ? failing : healthy).from(table) };
  const api = setup({
    document,
    window: {
      supabase: { createClient: () => client },
      Pupsik: { supabasePublicKey: 'public-test-key' },
    },
  });
  await api.refresh();
  assert.equal(api.state.errors.length, 0);
  assert.ok(api.state.loadedAt);
  const previous = api.state.data.ratings;
  const lastComplete = api.state.loadedAt;
  api.state.ratingSource = 'viewers';
  offline = true;
  await api.refresh();
  assert.equal(api.state.data.ratings, previous);
  assert.equal(api.state.loadedAt, lastComplete);
  assert.equal(api.state.ratingSource, 'viewers');
  assert.equal(document.elements.get('statsError').hidden, false);
  assert.equal(document.elements.get('statsRefresh').disabled, false);
  assert.match(
    document.elements.get('statsUpdatedAt').textContent,
    /Часть данных не обновлена/
  );
  offline = false;
  await api.refresh();
  assert.equal(document.elements.get('statsError').hidden, true);
  assert.equal(api.state.errors.length, 0);
  assert.notEqual(api.state.data.ratings, previous);
  assert.equal(api.state.ratingSource, 'viewers');
});
