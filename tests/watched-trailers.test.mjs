import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../script/trailers.js', import.meta.url),
  'utf8'
);
const context = {
  watchedTrailersSearchQuery: '',
  watchedTrailersType: 'all',
  watchedTrailersSort: 'newest',
  debounce: (fn) => fn,
};
vm.createContext(context);
vm.runInContext(
  source.slice(
    source.indexOf('function normalizeTrailerSearchText'),
    source.indexOf('function applyTrailerList')
  ),
  context
);

test('viewing days use Moscow time and ignore later edits', () => {
  const groups = context.groupWatchedTrailers([
    { id: 1, watched_at: '2026-10-02T21:05:00Z' },
    { id: 2, watched_at: '2026-10-03T16:00:00Z' },
    {
      id: 3,
      watched_at: '2026-10-02T20:59:00Z',
      updated_at: '2026-10-05T12:00:00Z',
    },
    { id: 4, watched_at: null, updated_at: '2026-10-05T12:00:00Z' },
  ]);
  assert.equal(groups[0][0], '2026-10-03');
  assert.equal(groups[0][1].length, 2);
  assert.equal(groups[1][0], '2026-10-02');
  assert.equal(groups[2][0], 'unknown');
  context.watchedTrailersSort = 'oldest';
  assert.equal(
    context.groupWatchedTrailers(groups.flatMap(([, items]) => items))[0][0],
    '2026-10-02'
  );
});

test('rating sort preserves zero and puts unrated trailers last; viewer scores use averages', () => {
  context.watchedTrailersSort = 'streamer';
  const rows = [
    { id: 1, streamer_rating: null },
    { id: 2, streamer_rating: 0 },
    { id: 3, streamer_rating: 8 },
  ];
  assert.equal(
    context
      .sortWatchedTrailers(rows)
      .map((row) => row.id)
      .join(','),
    '3,2,1'
  );
  context.watchedTrailersSort = 'viewers';
  const viewers = [
    { id: 1, viewer_rating_sum: 80, viewer_rating_count: 10 },
    { id: 2, viewer_rating_sum: 9, viewer_rating_count: 1 },
    { id: 3, viewer_rating_count: 0 },
  ];
  assert.equal(
    context
      .sortWatchedTrailers(viewers)
      .map((row) => row.id)
      .join(','),
    '2,1,3'
  );
});

test('media filters and normalized search combine, including legacy films', () => {
  const rows = [
    { id: 1, title: 'Ёлки', year: 2026 },
    { id: 2, title: 'Game', media_type: 'game', year: 2026 },
  ];
  context.watchedTrailersType = 'film';
  context.watchedTrailersSearchQuery = 'елки';
  assert.equal(context.getFilteredWatchedTrailers(rows)[0].id, 1);
  context.watchedTrailersType = 'game';
  assert.equal(context.getFilteredWatchedTrailers(rows).length, 0);
  context.watchedTrailersSearchQuery = '2026';
  assert.equal(context.getFilteredWatchedTrailers(rows)[0].id, 2);
});
