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
  ui.run('historyLoading = true; renderRecentMovies([])');
  assert.match(ui.ids.adminPlayerWelcomeStatus.textContent, /Загружаем/);
  ui.run('historyLoading = false; updateWelcomeStatus()');
  assert.match(ui.ids.adminPlayerWelcomeStatus.textContent, /Начните с поиска/);
  assert.equal(ui.ids.adminPlayerRecentMovies.children.length, 0);
  assert.equal(ui.ids.adminPlayerWelcomeStatus.hidden, false);
});

test('startup renders only cached recommendations and history loads once on first expansion', async () => {
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
    'verifyAdminAccess = async () => true; readHistoryCache = () => ({ items: cached }); setupSearchEvents = () => {}; setHistoryLoading = () => {}; loadHistory = fetchHistory; renderHistory = recordRender'
  );
  await ui.run('initPage()');
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
