import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup() {
  class Element {
    children = [];
    attrs = {};
    listeners = {};
    setAttribute(key, value) {
      this.attrs[key] = value;
    }
    append(...items) {
      this.children.push(...items);
    }
    replaceChildren() {
      this.children = [];
    }
    addEventListener(key, callback) {
      this.listeners[key] = callback;
    }
  }
  const ids = Object.fromEntries(
    [
      'adminPlayerRecentMovies',
      'adminPlayerWelcomeStatus',
      'adminPlayerWelcomeHint',
      'adminPlayerSearchInput',
    ].map((id) => [id, new Element()])
  );
  const context = vm.createContext({
    window: {},
    console,
    document: {
      getElementById: (id) => ids[id],
      createElement: () => new Element(),
      addEventListener() {},
    },
  });
  vm.runInContext(
    readFileSync(new URL('../script/admin-player.js', import.meta.url), 'utf8'),
    context
  );
  return { ids, context, run: (source) => vm.runInContext(source, context) };
}

test('welcome recommends up to four distinct recent films and keeps titles as text', () => {
  const ui = setup();
  ui.context.history = [
    null,
    { kp_id: 0 },
    ...[1, 1, 2, 3, 4, 5].map((id) => ({
      kp_id: id,
      title: `<Film ${id}>`,
      year: 2020,
      poster: 'poster.webp',
    })),
  ];
  ui.run('renderRecentMovies(history)');
  const cards = ui.ids.adminPlayerRecentMovies.children;
  assert.equal(cards.length, 4);
  assert.equal(cards[0].children[1].textContent, '<Film 1>');
  assert.equal(cards[1].children[1].textContent, '<Film 2>');
  assert.equal(cards[3].children[1].textContent, '<Film 4>');
  assert.equal(cards[0].children[0].children[0].src, 'poster.webp');
  assert.equal(ui.ids.adminPlayerWelcomeStatus.hidden, true);
  ui.run('renderRecentMovies([{ kp_id: 9, title: "Solo" }])');
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 1);
  assert.equal(
    ui.ids.adminPlayerRecentMovies.children[0].children[0].children[0].src,
    'images/placeholder-poster.webp'
  );
});

test('welcome distinguishes loading and empty history without fake recommendations', () => {
  const ui = setup();
  ui.run('recentLoading = true; renderRecentMovies([])');
  assert.match(ui.ids.adminPlayerWelcomeStatus.textContent, /Загружаем/);
  ui.run('recentLoading = false; updateWelcomeStatus()');
  assert.match(ui.ids.adminPlayerWelcomeStatus.textContent, /Начните с поиска/);
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 0);
  assert.equal(ui.ids.adminPlayerWelcomeStatus.hidden, false);
});

test('startup refreshes recommendations independently and full history loads on first expansion', async () => {
  const ui = setup();
  const listeners = {};
  ui.ids.adminPlayerApp = {};
  ui.ids.adminPlayerHistory = {
    open: false,
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
  };
  ui.ids.adminPlayerHistoryError = {};
  const history = Array.from({ length: 8 }, (_, index) => ({
    kp_id: index + 1,
    title: `Film ${index}`,
  }));
  ui.context.cached = history;
  let recentRequests = 0;
  ui.context.recordRecentRequest = () => {
    recentRequests++;
  };
  let requests = 0;
  let resolve;
  let renders = 0;
  ui.context.fetchHistory = () => {
    requests++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  ui.context.recordRender = () => {
    renders++;
  };
  ui.run(
    'verifyAdminAccess = async () => true; readHistoryCache = () => ({ items: cached }); setupSearchEvents = () => {}; setHistoryLoading = () => {}; loadHistory = fetchHistory; renderHistory = recordRender; loadRecentMovies = async () => recordRecentRequest()'
  );
  await ui.run('initPage()');
  assert.equal(recentRequests, 1);
  assert.equal(requests, 0);
  assert.equal(renders, 0);
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 4);
  ui.ids.adminPlayerHistory.open = true;
  listeners.toggle({ target: ui.ids.adminPlayerHistory });
  const first = ui.run('ensureHistoryLoaded()');
  const second = ui.run('ensureHistoryLoaded()');
  assert.equal(first, second);
  assert.equal(requests, 1);
  resolve(history);
  await first;
  ui.ids.adminPlayerHistory.open = false;
  listeners.toggle({ target: ui.ids.adminPlayerHistory });
  ui.ids.adminPlayerHistory.open = true;
  listeners.toggle({ target: ui.ids.adminPlayerHistory });
  assert.equal(requests, 1);
});

test('collapsed history does not create list cards or poster images', () => {
  const ui = setup();
  ui.ids.adminPlayerHistory = { open: false };
  ui.ids.adminPlayerHistoryList = { children: [] };
  ui.run('renderHistory([{ kp_id: 1, title: "Film" }])');
  assert.equal(ui.ids.adminPlayerHistoryList.children.length, 0);
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 1);
});

test('recommendations load on a first visit without loading or caching the full list', async () => {
  const ui = setup();
  const requests = [];
  ui.context.window.Pupsik = { apiUrl: (path) => path };
  ui.context.fetch = async (url) => {
    requests.push(url);
    return {
      ok: true,
      json: async () => ({
        items: [1, 2, 3, 4].map((kp_id) => ({ kp_id, title: `Film ${kp_id}` })),
      }),
    };
  };
  ui.run('getAdminAuthHeaders = () => ({})');
  await ui.run('loadRecentMovies()');
  assert.deepEqual(requests, ['/api/admin?action=player-history&limit=4']);
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 4);
  assert.equal(ui.run('currentHistory.length'), 0);
  assert.equal(ui.run('historyLoaded'), false);
});

test('late recommendations cannot replace fresher full history or user changes', async () => {
  const ui = setup();
  let resolve;
  ui.context.window.Pupsik = { apiUrl: (path) => path };
  ui.context.fetch = () =>
    new Promise((done) => {
      resolve = done;
    });
  ui.run('getAdminAuthHeaders = () => ({})');
  const pending = ui.run('loadRecentMovies()');
  ui.run(
    'historyRevision++; renderRecentMovies([{ kp_id: 9, title: "Fresh" }])'
  );
  resolve({
    ok: true,
    json: async () => ({ items: [{ kp_id: 1, title: 'Old' }] }),
  });
  await pending;
  assert.equal(
    ui.ids.adminPlayerRecentMovies.children[0].children[1].textContent,
    'Fresh'
  );
});

test('server limits recommendation queries to four and defaults full history to fifteen', async () => {
  const source = readFileSync(
    new URL('../api/admin.js', import.meta.url),
    'utf8'
  );
  const context = vm.createContext({
    MAX_PLAYER_HISTORY: 15,
    ADMIN_PLAYER_HISTORY_TABLE: 'history',
    HISTORY_CACHE_CONTROL: 'private',
    createHistoryEtag: () => 'etag',
    normalizeEtag: () => '',
    console,
  });
  vm.runInContext(
    source.slice(
      source.indexOf('async function getPlayerHistory('),
      source.indexOf('async function savePlayerHistoryItem(')
    ),
    context
  );
  const limits = [];
  const query = {
    select() {
      return this;
    },
    order() {
      return this;
    },
    limit(value) {
      limits.push(value);
      return Promise.resolve({ data: [], error: null });
    },
  };
  const supabase = { from: () => query };
  const res = {
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json() {},
  };
  await context.getPlayerHistory(
    supabase,
    { query: { limit: '4' }, headers: {} },
    res
  );
  await context.getPlayerHistory(supabase, { query: {}, headers: {} }, res);
  assert.deepEqual(limits, [4, 15]);
  await context.getPlayerHistory(
    supabase,
    { query: { limit: '16' }, headers: {} },
    res
  );
  assert.equal(res.code, 400);
  assert.deepEqual(limits, [4, 15]);
});

test('opening a recommendation follows the player and history flow; background updates leave playback alone', async () => {
  const ui = setup();
  const opened = [];
  const saved = [];
  ui.context.recordOpen = async (movie) => opened.push(movie);
  ui.context.recordSave = async (movie) => saved.push(movie);
  ui.run(
    'loadPlayerForMovie = recordOpen; saveHistoryItem = recordSave; renderRecentMovies([{ kp_id: 42, title: "Film", year: 2020 }])'
  );
  ui.ids.adminPlayerRecentMovies.children[0].listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened[0].filmId, 42);
  assert.equal(saved[0].filmId, 42);
  assert.equal(ui.ids.adminPlayerSearchInput.value, 'Film');
  ui.run('renderRecentMovies([{ kp_id: 99, title: "Changed" }])');
  assert.equal(
    ui.ids.adminPlayerRecentMovies.children[0].children[1].textContent,
    'Film'
  );
});
