import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DAY = 86400000;
const token = (iat, exp) =>
  `${Buffer.from(JSON.stringify({ iat, exp, sid: 'test' })).toString('base64url')}.signature`;

function browser(savedToken, fetch) {
  let now = 100 * DAY;
  const storage = new Map(savedToken ? [['adminToken', savedToken]] : []);
  const timers = new Map();
  const listeners = {};
  let timerId = 0;
  const window = {
    Pupsik: { apiUrl: (path) => path },
    addEventListener: (name, listener) => {
      listeners[name] = listener;
    },
    dispatchEvent: (event) => {
      listeners[event.type]?.(event);
    },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, listener) => {
      listeners[name] = listener;
    },
  };
  const context = vm.createContext({
    window,
    document,
    navigator: {},
    fetch,
    Event,
    AbortSignal,
    console: { warn() {}, error() {} },
    Date: { now: () => now },
    atob: (value) => Buffer.from(value, 'base64').toString(),
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout: (fn, delay) => {
      timers.set(++timerId, { fn, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(read('script/admin-session.js'), context);
  return {
    context,
    session: window.PupsikAdminSession,
    storage,
    timers,
    listeners,
    document,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('fresh tokens require no renewal requests; short configured TTLs renew proportionally', async () => {
  let calls = 0;
  const b = browser(token(100 * DAY, 130 * DAY), async () => {
    calls++;
  });
  await b.session.refresh();
  assert.equal(calls, 0);
  assert.equal([...b.timers.values()][0].delay, DAY);
  b.session.set(token(100 * DAY, 100 * DAY + 3600000), null);
  assert.equal([...b.timers.values()][0].delay, 2700000);
});

test('network and server errors preserve tokens and throttle retries', async () => {
  for (const response of [new Error('offline'), { ok: false, status: 503 }]) {
    let calls = 0;
    const saved = token(72 * DAY, 102 * DAY);
    const b = browser(saved, async () => {
      calls++;
      if (response instanceof Error) throw response;
      return response;
    });
    await b.session.refresh();
    await b.session.refresh();
    assert.equal(calls, 1);
    assert.equal(b.session.getToken(), saved);
    assert.equal([...b.timers.values()][0].delay, 300000);
    b.advance(300000);
    await b.session.refresh();
    assert.equal(calls, 2);
  }
});

test('concurrent renewal requests share one response and save the new expiry', async () => {
  let resolve;
  let calls = 0;
  const fresh = token(100 * DAY, 130 * DAY);
  const b = browser(token(72 * DAY, 102 * DAY), () => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const first = b.session.refresh();
  const second = b.session.refresh();
  resolve({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, token: fresh, expiresAt: 'new-expiry' }),
  });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(b.session.getToken(), fresh);
  assert.equal(b.storage.get('adminTokenExpiresAt'), 'new-expiry');
});

test('401 clears the session, but late responses cannot overwrite logout or another tab', async () => {
  const expired = browser(token(60 * DAY, 90 * DAY), async () => ({
    status: 401,
  }));
  await expired.session.refresh();
  assert.equal(expired.session.getToken(), null);
  for (const status of [200, 401]) {
    let resolve;
    const b = browser(
      token(72 * DAY, 102 * DAY),
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = b.session.refresh();
    const replacement = status === 401 ? token(100 * DAY, 130 * DAY) : null;
    b.session.set(replacement, null);
    resolve({
      ok: true,
      status,
      json: async () => ({ ok: true, token: 'stale' }),
    });
    await pending;
    assert.equal(b.session.getToken(), replacement);
  }
});

test('hidden pages pause timers and storage changes schedule the shared token', () => {
  const b = browser(token(72 * DAY, 102 * DAY), async () => {});
  b.document.visibilityState = 'hidden';
  b.listeners.visibilitychange();
  assert.equal(b.timers.size, 0);
  b.storage.set('adminToken', token(100 * DAY, 130 * DAY));
  b.document.visibilityState = 'visible';
  b.listeners.storage({ key: 'adminToken' });
  assert.equal([...b.timers.values()][0].delay, DAY);
});

test('restoring a session preserves credentials on failures and clears confirmed 401', async () => {
  for (const failure of ['network', 'server', 'env', 'invalid']) {
    const saved = token(100 * DAY, 130 * DAY);
    const b = browser(saved, async () => {
      if (failure === 'network') throw new Error('offline');
      return { ok: false, status: failure === 'invalid' ? 401 : 503 };
    });
    Object.assign(b.context, {
      adminToken: saved,
      adminTokenExpiresAt: null,
      isAdmin: false,
      adminElements: [],
      clearAdminSession: () => b.session.set(null, null),
      loadEnv: async () => {
        throw new Error('server down');
      },
    });
    const core = read('script/admin.js');
    vm.runInContext(
      core.slice(
        core.indexOf('async function verifyAdminTokenRequest('),
        core.indexOf('// Admin UI')
      ),
      b.context
    );
    if (failure === 'env') {
      vm.runInContext(
        'verifyAdminTokenRequest = async () => ({ ok: true });',
        b.context
      );
    }
    await vm.runInContext('restoreAdminSession()', b.context);
    assert.equal(b.session.getToken(), failure === 'invalid' ? null : saved);
    assert.equal(b.context.isAdmin, false);
  }
});

test('server default TTL is 30 days and explicit TTL remains supported', () => {
  const require = createRequire(import.meta.url);
  const { issueAdminToken } = require('../lib/admin-session.js');
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousTtl = process.env.ADMIN_SESSION_TTL_MS;
  try {
    process.env.ADMIN_SESSION_SECRET = 'test-secret';
    delete process.env.ADMIN_SESSION_TTL_MS;
    const issued = issueAdminToken().payload;
    assert.equal(issued.exp - issued.iat, 30 * DAY);
    process.env.ADMIN_SESSION_TTL_MS = '3600000';
    const custom = issueAdminToken().payload;
    assert.equal(custom.exp - custom.iat, 3600000);
  } finally {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
    if (previousTtl === undefined) delete process.env.ADMIN_SESSION_TTL_MS;
    else process.env.ADMIN_SESSION_TTL_MS = previousTtl;
  }
});
