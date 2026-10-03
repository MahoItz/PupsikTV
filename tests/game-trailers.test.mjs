import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = { require: () => ({}), module: { exports: {} } };
vm.createContext(context);
vm.runInContext(
  readFileSync(
    new URL('../api/trailer-watchlist.js', import.meta.url),
    'utf8'
  ) +
    '\nthis.create = normalizeCreatePayload; this.patch = normalizePatchPayload;',
  context
);
const base = {
  title: 'Example',
  youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
  youtube_video_id: 'abcdefghijk',
};

test('existing clients create films and games preserve cached details without a release date', () => {
  assert.equal(context.create(base).media_type, 'film');
  const game = context.create({
    ...base,
    media_type: 'game',
    igdb_id: 42,
    game_data: { description: 'Announcement', releaseDate: null },
  });
  assert.equal(game.igdb_id, 42);
  assert.equal(game.year, null);
  assert.equal(game.game_data.description, 'Announcement');
  assert.equal(game.kinopoisk_id, null);
  assert.equal(context.create({ ...base, media_type: 'game' }).igdb_id, null);
});

test('invalid types, IDs and mixed catalog payloads are rejected', () => {
  for (const extra of [
    { media_type: 'unknown' },
    { media_type: 'game', igdb_id: -1 },
    { media_type: 'game', igdb_id: '42oops' },
    { media_type: 'game', kinopoisk_id: 42 },
    { media_type: 'film', igdb_id: 42 },
    { media_type: 'film', game_data: {} },
  ])
    assert.equal(context.create({ ...base, ...extra }), null);
});

test('metadata can be edited without changing catalog identity or viewer ratings', () => {
  const changes = context.patch({
    title: 'New title',
    game_data: { description: 'Edited' },
    viewer_rating_count: 999,
  });
  assert.equal(changes.title, 'New title');
  assert.equal(changes.game_data.description, 'Edited');
  assert.equal(changes.viewer_rating_count, undefined);
  assert.equal(context.patch({ media_type: 'film' }), null);
});
