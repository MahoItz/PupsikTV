import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const apiSource = readFileSync(
  new URL('../api/translate-description.js', import.meta.url),
  'utf8'
);
const clientSource = readFileSync(
  new URL('../script/media-details.js', import.meta.url),
  'utf8'
);

async function translate(content, finishReason = 'stop') {
  let request;
  const context = {
    module: { exports: {} },
    process: { env: { OPENROUTER_API: 'test-key' } },
    console,
    fetch: async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content }, finish_reason: finishReason }],
        }),
      };
    },
  };
  vm.runInNewContext(apiSource, context);
  const result = {};
  const response = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await context.module.exports(
    {
      method: 'POST',
      body: {
        model: 'test/model',
        text: 'Explore a vast world and fight monsters.',
      },
    },
    response
  );
  return { ...result, request };
}

test('empty, echoed and English-only model responses fail instead of returning the original', async () => {
  for (const content of [
    '',
    'Explore a vast world and fight monsters.',
    'Discover an amazing adventure.',
    null,
    {},
  ]) {
    const result = await translate(content);
    assert.equal(result.status, 502);
    assert.ok(result.body.error);
    assert.equal(result.body.translated, undefined);
  }
});

test('Russian translations with game names succeed, including structured model content', async () => {
  for (const content of [
    'Исследуйте огромный мир Elden Ring и сражайтесь с чудовищами.',
    [{ text: 'Исследуйте огромный мир и сражайтесь с чудовищами.' }],
  ]) {
    const result = await translate(content);
    assert.equal(result.status, 200);
    assert.match(result.body.translated, /Исследуйте/);
    assert.match(result.request.messages[1].content, /into Russian/);
  }
});

test('truncated translations fail rather than being saved as complete', async () => {
  const result = await translate('Исследуйте огромный мир', 'length');
  assert.equal(result.status, 502);
  assert.match(result.body.error, /лимит длины/);
});

test('client rejects old API English successes and tries a working fallback', async () => {
  const calls = [];
  const context = {
    window: { Pupsik: { apiUrl: (path) => path } },
    console: { log() {}, warn() {} },
    aiModelOptions: [{ ai_model: 'primary' }, { ai_model: 'fallback' }],
    aiModelStatuses: { fallback: { status: 'active' } },
    fetch: async (_url, options) => {
      const { model } = JSON.parse(options.body);
      calls.push(model);
      return {
        ok: true,
        json: async () => ({
          translated:
            model === 'primary'
              ? 'Explore a vast world.'
              : 'Исследуйте огромный мир.',
        }),
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    clientSource.slice(
      clientSource.indexOf('function isRussianGameDescriptionTranslation('),
      clientSource.indexOf(
        'async function prefetchOrderGameDescriptionForOrder('
      )
    ),
    context
  );
  assert.equal(
    await context.translateGameDescriptionWithFallback(
      'Explore a vast world.',
      'primary'
    ),
    'Исследуйте огромный мир.'
  );
  assert.deepEqual(calls, ['primary', 'fallback']);
  assert.equal(
    context.isRussianGameDescriptionTranslation('Explore a vast world.'),
    false
  );
});
