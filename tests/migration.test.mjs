import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('site configuration resolves APIs and assets below the project URL', () => {
  const context = {
    window: {},
    URL,
    document: {
      currentScript: {
        src: 'https://mahoitz.github.io/PupsikTV/script/site-config.js',
      },
    },
  };
  vm.runInNewContext(read('script/site-config.js'), context);
  const config = context.window.Pupsik;
  assert.equal(
    config.apiUrl('/api/admin?action=env'),
    `${config.apiBase}/admin?action=env`
  );
  assert.equal(
    config.apiUrl('/external?provider=poster-proxy'),
    `${config.apiBase}/external?provider=poster-proxy`
  );
  assert.equal(
    config.assetUrl('/images/test.webp'),
    'https://mahoitz.github.io/PupsikTV/images/test.webp'
  );
});

test('every HTML entrypoint loads configuration before its client scripts', () => {
  for (const name of readdirSync(root).filter((name) =>
    name.endsWith('.html')
  )) {
    const html = read(name);
    const configIndex = html.indexOf('src="script/site-config.js"');
    assert.ok(configIndex >= 0, name);
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const path = match[1];
      if (/^(?:https?:|about:|data:)/.test(path)) continue;
      assert.ok(!path.startsWith('/'), `${name}: ${path}`);
      if (/\.(?:js|css|html|webp|svg|woff2)(?:$|\?)/.test(path)) {
        assert.ok(
          existsSync(resolve(root, path.split('?')[0])),
          `${name}: missing ${path}`
        );
      }
      if (path.startsWith('script/') && !path.endsWith('site-config.js')) {
        assert.ok(match.index > configIndex, `${name}: configuration order`);
      }
    }
  }
});

test('client scripts parse as classic browser scripts and contain no direct API fetches', () => {
  for (const name of readdirSync(resolve(root, 'script')).filter((name) =>
    name.endsWith('.js')
  )) {
    const source = read(`script/${name}`);
    new vm.Script(source, { filename: name });
    assert.doesNotMatch(source, /fetch\(["'`]\/api(?:\/|["'`])/);
    assert.doesNotMatch(source, /pupsik-tv\.(?:vercel|netlify)\.app/);
  }
});

test('Kinopoisk interception preserves provider paths and targets Supabase', async () => {
  const calls = [];
  const context = {
    URL,
    URLSearchParams,
    Request,
    Headers,
    window: {
      fetch: async (...args) => {
        calls.push(args);
        return { ok: true };
      },
    },
    document: {
      baseURI: 'https://mahoitz.github.io/PupsikTV/',
      currentScript: {
        src: 'https://mahoitz.github.io/PupsikTV/script/site-config.js',
      },
    },
  };
  vm.runInNewContext(read('script/site-config.js'), context);
  const source = read('script/core.js');
  vm.runInNewContext(source.slice(0, source.indexOf('})();') + 5), context);
  await context.window.fetch(
    'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=test&page=2'
  );
  const url = new URL(calls[0][0]);
  assert.equal(url.hostname, 'shwekurmzyzivtworjup.supabase.co');
  assert.equal(url.pathname, '/functions/v1/pupsik-api/external');
  assert.equal(url.searchParams.get('keyword'), 'test');
  assert.equal(url.searchParams.get('page'), '2');
});

test('Pages artifact contains client files and excludes server source', () => {
  assert.ok(existsSync(resolve(root, 'dist/pages/index.html')));
  assert.ok(existsSync(resolve(root, 'dist/pages/script/site-config.js')));
  for (const name of ['index.html', 'stats.html']) {
    const html = read(`dist/pages/${name}`);
    assert.doesNotMatch(html, /https:\/\/[^"\s]+supabase-js/);
    const sdkPath = html.match(/src="(script\/vendor\/supabase-[^"]+\.js)"/);
    assert.ok(sdkPath, `${name}: local Supabase library`);
    assert.ok(existsSync(resolve(root, 'dist/pages', sdkPath[1])));
    assert.ok(
      html.indexOf(sdkPath[0]) <
        html.indexOf(
          `src="script/${name === 'index.html' ? 'core' : 'stats'}.js"`
        )
    );
  }
  for (const name of [
    'api',
    'lib',
    'supabase',
    '.git',
    '.env',
    'node_modules',
  ]) {
    assert.ok(!existsSync(resolve(root, 'dist/pages', name)), name);
  }
});
