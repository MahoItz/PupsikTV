import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { localCacheSource } from './helpers/local-cache-source.mjs';

const source = readFileSync(
  new URL('../script/data-init.js', import.meta.url),
  'utf8'
);
const metadataChanges = {
  title: 'New title',
  originalTitle: 'New original title',
  poster: 'new-poster.webp',
  year: 2026,
  genre: 'Drama',
  kpRating: 8.7,
  dateAdded: '2026-10-07',
  kinopoiskId: '123',
  imdbId: 'tt123',
};

function createContext(row) {
  const writes = [];
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: () => null },
    supabaseClient: {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({ data: [row], count: 1, error: null }),
          }),
        }),
      }),
    },
    localStorage: { setItem: (...args) => writes.push(args) },
    normalizeWatchSource: (value) => value || '',
    toggleSectionLoading() {},
    renderMovies() {},
    allMovies: [],
    totalMovies: 0,
    moviesLoading: false,
  });
  vm.runInContext(localCacheSource + '\n' + source, context);
  return { context, writes };
}

for (const [field, value] of Object.entries(metadataChanges)) {
  test(`changing ${field} refreshes movie state and persistent cache`, async () => {
    const row = { id: 1, title: 'Old title', rating_numeric: 7 };
    const { context, writes } = createContext(row);
    await context.loadMoviesFromSupabase();
    const previous = context.allMovies;
    const oldSignature = context.computeMoviesSignature(previous);
    const columns = {
      originalTitle: 'original_title',
      genre: 'genres',
      kpRating: 'rating_OMDB',
      dateAdded: 'date',
      kinopoiskId: 'kp_id',
      imdbId: 'imdb_id',
    };
    row[columns[field] || field] = value;
    await context.loadMoviesFromSupabase();
    assert.notEqual(
      context.computeMoviesSignature(context.allMovies),
      oldSignature
    );
    assert.notEqual(context.allMovies, previous);
    assert.equal(context.allMovies[0][field], value);
    assert.equal(writes.length, 2);
    assert.equal(writes[1][0], 'moviesCache');
    assert.equal(JSON.parse(writes[1][1])[0][field], value);

    await context.loadMoviesFromSupabase();
    assert.equal(
      writes.length,
      2,
      'unchanged data should not rewrite the cache'
    );
  });
}
