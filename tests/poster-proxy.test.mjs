import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sourceUrl =
  'https://kinopoiskapiunofficial.tech/images/posters/kp_small/687670.jpg';

test('display URLs use the server for Kinopoisk posters without nesting proxies', () => {
  const context = {
    window: {},
    URL,
    document: {
      currentScript: { src: 'https://pupsik-tv.com/script/site-config.js' },
    },
  };
  vm.runInNewContext(read('../script/site-config.js'), context);
  const config = context.window.Pupsik;
  const proxy = config.posterUrl(sourceUrl);
  assert.equal(
    proxy,
    `${config.apiBase}/external?provider=poster-proxy&url=${encodeURIComponent(sourceUrl)}`
  );
  assert.equal(config.posterUrl(proxy), proxy);
  for (const url of [
    'images/placeholder-poster.webp',
    'data:image/webp;base64,abc',
    'https://other.test/image.jpg',
    '',
    null,
  ]) {
    assert.equal(config.posterUrl(url), url);
  }
});

async function request(url, fetchImpl) {
  const context = {
    require: () => ({}),
    module: { exports: {} },
    URL,
    Buffer,
    AbortSignal,
    console: { error() {} },
    fetch: fetchImpl,
  };
  vm.runInNewContext(read('../api/external.js'), context);
  const res = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
  await context.module.exports(
    { query: { provider: 'poster-proxy', url }, method: 'GET' },
    res
  );
  return res;
}

test('server returns poster bytes, image type and cache headers with automatic redirects disabled', async () => {
  let calls = 0;
  const res = await request(sourceUrl, async (url, options) => {
    calls++;
    assert.equal(url, sourceUrl);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    return new Response(new Uint8Array([255, 216, 255]), {
      headers: { 'content-type': 'image/jpeg' },
    });
  });
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([...res.body], [255, 216, 255]);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.match(res.headers['Cache-Control'], /max-age=86400/);
});

test('Kinopoisk image proxy refuses API paths, credentials, ports, HTTP and lookalike hosts', async () => {
  for (const url of [
    sourceUrl.replace('https:', 'http:'),
    sourceUrl.replace('https://', 'https://user:pass@'),
    sourceUrl.replace('.tech/', '.tech:444/'),
    sourceUrl.replace(
      '/images/posters/kp_small/687670.jpg',
      '/api/v2.2/films/687670'
    ),
    sourceUrl.replace(
      'kinopoiskapiunofficial.tech',
      'evil.kinopoiskapiunofficial.tech'
    ),
    sourceUrl.replace(
      'kinopoiskapiunofficial.tech',
      'kinopoiskapiunofficial.tech.evil.test'
    ),
  ]) {
    const res = await request(url, () => {
      throw new Error('Must not fetch');
    });
    assert.equal(res.statusCode, 400, url);
  }
});

test('server rejects non-raster content and oversized posters before caching', async () => {
  for (const response of [
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response('html', { headers: { 'content-type': 'text/html' } }),
    new Response('x', {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(11 * 1024 * 1024),
      },
    }),
    new Response(new Uint8Array(10 * 1024 * 1024 + 1), {
      headers: { 'content-type': 'image/jpeg' },
    }),
  ]) {
    const res = await request(sourceUrl, async () => response);
    assert.equal(res.statusCode, 502);
    assert.equal(res.headers['Cache-Control'], undefined);
  }
});

test('connection failures and upstream HTTP errors do not return cacheable image success', async () => {
  const reset = await request(sourceUrl, () => {
    throw new Error('connection reset');
  });
  assert.equal(reset.statusCode, 500);
  assert.equal(reset.headers['Cache-Control'], undefined);
  const missing = await request(
    sourceUrl,
    async () => new Response('', { status: 404 })
  );
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers['Cache-Control'], undefined);
});

test('server follows the real Kinopoisk redirect chain with a shared timeout', async () => {
  const urls = [
    sourceUrl,
    'https://st.kp.yandex.net/images/film_iphone/iphone360_687670.jpg',
    'https://avatars.mds.yandex.net/get-kinopoisk-image/4303601/bb040be7-b083-4d2a-a141-99216a5226dc/360',
  ];
  let calls = 0;
  let signal;
  const res = await request(sourceUrl, async (url, options) => {
    assert.equal(url, urls[calls]);
    assert.equal(options.redirect, 'manual');
    if (signal) assert.equal(options.signal, signal);
    signal = options.signal;
    calls++;
    if (calls < urls.length)
      return new Response('', {
        status: 302,
        headers: { Location: urls[calls] },
      });
    return new Response(new Uint8Array([255, 216, 255]), {
      headers: { 'content-type': 'image/jpeg' },
    });
  });
  assert.equal(calls, 3);
  assert.equal(res.statusCode, 200);
});

test('every redirect destination is validated before a network request', async () => {
  for (const location of [
    'https://127.0.0.1/private',
    'https://st.kp.yandex.net.evil.test/images/film_iphone/iphone360_687670.jpg',
    'http://st.kp.yandex.net/images/film_iphone/iphone360_687670.jpg',
    'https://user:pass@st.kp.yandex.net/images/film_iphone/iphone360_687670.jpg',
    'https://st.kp.yandex.net:444/images/film_iphone/iphone360_687670.jpg',
    'https://st.kp.yandex.net/api/private',
    'https://st.kp.yandex.net/images/film_iphone/iphone360_123.jpg',
    'https://st.kp.yandex.net/images/film_iphone/iphone360_687670.jpg?url=http://127.0.0.1',
    'https://avatars.mds.yandex.net/api/private',
    'https://avatars.mds.yandex.net/get-kinopoisk-image/123/a/360?url=http://127.0.0.1',
    'https://avatars.mds.yandex.net/get-kinopoisk-image/123/a%2fb/360',
    'https://[invalid',
  ]) {
    let calls = 0;
    const res = await request(sourceUrl, async () => {
      calls++;
      return new Response('', { status: 302, headers: { Location: location } });
    });
    assert.equal(calls, 1, location);
    assert.equal(res.statusCode, 502, location);
    assert.equal(res.headers['Cache-Control'], undefined);
  }
});

test('redirect loops, missing locations and chains beyond three redirects fail without caching', async () => {
  for (const mode of ['loop', 'missing', 'long']) {
    let calls = 0;
    const res = await request(sourceUrl, async () => {
      calls++;
      const location =
        mode === 'loop'
          ? 'https://st.kp.yandex.net/images/film_iphone/iphone360_687670.jpg'
          : mode === 'long'
            ? `https://avatars.mds.yandex.net/get-kinopoisk-image/123/image${calls}/360`
            : null;
      return new Response('', {
        status: 302,
        headers: location ? { Location: location } : {},
      });
    });
    assert.equal(calls, mode === 'loop' ? 2 : mode === 'missing' ? 1 : 4);
    assert.equal(res.statusCode, 502);
    assert.equal(res.headers['Cache-Control'], undefined);
  }
});

test('full posters, actor photos and the upstream placeholder use only their matching CDN paths', async () => {
  for (const [input, path] of [
    [sourceUrl.replace('kp_small', 'kp'), '/images/film_big/687670.jpg'],
    [
      sourceUrl.replace('posters/kp_small', 'actor_posters/kp'),
      '/images/actor_iphone/iphone360_687670.jpg',
    ],
    [sourceUrl, '/images/no-poster.gif'],
  ]) {
    let calls = 0;
    const res = await request(input, async (url) => {
      calls++;
      if (calls === 1)
        return new Response('', {
          status: 301,
          headers: { Location: `https://st.kp.yandex.net${path}` },
        });
      assert.equal(url, `https://st.kp.yandex.net${path}`);
      return new Response(new Uint8Array([1]), {
        headers: {
          'content-type': path.endsWith('gif') ? 'image/gif' : 'image/jpeg',
        },
      });
    });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
  }
});
