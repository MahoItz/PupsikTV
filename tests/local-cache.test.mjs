import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { localCacheSource } from './helpers/local-cache-source.mjs';

function setup(values = {}, { readError = false, removeError = false } = {}) {
  const storage = new Map(Object.entries(values));
  const removed = [];
  const context = vm.createContext({
    console: { warn() {} },
    localStorage: {
      getItem(key) {
        if (readError) throw new Error('Storage unavailable');
        return storage.get(key) ?? null;
      },
      removeItem(key) {
        removed.push(key);
        if (removeError) throw new Error('Storage read-only');
        storage.delete(key);
      },
    },
  });
  vm.runInContext(localCacheSource, context);
  return { context, storage, removed };
}

for (const key of ['ratedMovies', 'ratedGames']) {
  for (const value of [
    '{broken',
    '',
    'null',
    '[]',
    '42',
    '"text"',
    '{"1":{}}',
    '{"1":false}',
    '{"1":""}',
    '{"1":12}',
  ]) {
    test(`${key}: discards invalid JSON or rating structure ${value}`, () => {
      const { context, storage, removed } = setup({
        [key]: value,
        unrelated: 'keep',
      });
      const fallback = {};
      assert.equal(
        context.readLocalJson(key, fallback, context.isRatingCache),
        fallback
      );
      assert.equal(storage.has(key), false);
      assert.equal(storage.get('unrelated'), 'keep');
      assert.deepEqual(removed, [key]);
    });
  }
}

test('valid numeric, legacy string, zero and stable movie ratings remain intact', () => {
  const valid = { 1: 0, 2: '8.5', 'kp:123': 11, 'title:Movie|year:2025': 7 };
  const { context, removed } = setup({ ratedMovies: JSON.stringify(valid) });
  const result = context.readLocalJson(
    'ratedMovies',
    {},
    context.isRatingCache
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), valid);
  assert.deepEqual(removed, []);
});

for (const key of ['moviesCache', 'gamesCache']) {
  for (const value of [
    '{broken',
    'null',
    '{}',
    '[null]',
    '[42]',
    '[{}]',
    '[{"id":1,"title":{}}]',
    '[{"id":1,"title":"Movie","actors":[null]}]',
    '[{"id":1,"title":"Movie","poster":{}}]',
    '[{"id":1,"title":"Movie","description":[]}]',
    '[{"id":1,"title":"Movie","ratingSum":{}}]',
    '[{"id":1,"title":"Movie"},{"id":1,"title":"Duplicate"}]',
  ]) {
    test(`${key}: discards malformed catalog structure ${value}`, () => {
      const { context, storage } = setup({ [key]: value });
      assert.equal(
        context.readLocalJson(key, null, context.isCatalogCache),
        null
      );
      assert.equal(storage.has(key), false);
    });
  }
}

test('valid old and new catalog snapshots, including game descriptions, are retained', () => {
  for (const items of [
    [],
    [
      {
        id: 1,
        title: 'Old cache',
        year: '2025',
        actors: ['Actor'],
        ratingSum: '16',
        ratingCount: 2,
      },
    ],
    [
      {
        id: 2,
        title: 'Game',
        description: { original: 'Original', translated: null },
        _detailsLoaded: false,
      },
    ],
  ]) {
    const { context, removed } = setup({ moviesCache: JSON.stringify(items) });
    const result = context.readLocalJson(
      'moviesCache',
      null,
      context.isCatalogCache
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result)), items);
    assert.deepEqual(removed, []);
  }
});

test('missing values use defaults without deleting anything', () => {
  const { context, removed } = setup();
  const fallback = {};
  assert.equal(
    context.readLocalJson('ratedMovies', fallback, context.isRatingCache),
    fallback
  );
  assert.equal(
    context.readLocalJson('moviesCache', null, context.isCatalogCache),
    null
  );
  assert.deepEqual(removed, []);
});

test('storage read and cleanup failures never escape safe cache reads', () => {
  for (const options of [{ readError: true }, { removeError: true }]) {
    const { context } = setup({ moviesCache: '{broken' }, options);
    assert.equal(
      context.readLocalJson('moviesCache', null, context.isCatalogCache),
      null
    );
  }
});
