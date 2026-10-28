'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDeepSeekProvider, BASE_URL, MODELS } = require('../src/chat/providers/deepseek');
const { ChatError } = require('../src/chat/chat-error');

const KEY = 'sk-test-0123456789abcdef';
const MESSAGES = [
  { role: 'system', content: 'persona' },
  { role: 'user', content: 'halo' },
];

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  impl.calls = calls;
  return impl;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function failure(provider, args) {
  try {
    await provider.send(args);
  } catch (error) {
    assert.ok(error instanceof ChatError, 'expected ChatError, got ' + error);
    return error;
  }
  assert.fail('expected the call to fail');
}

test('sends a non-streaming, non-thinking chat completion to the official endpoint', async () => {
  const fetchImpl = fakeFetch(() =>
    jsonResponse(200, { choices: [{ message: { content: '  Halo, Rover!  ' } }] }),
  );
  const provider = createDeepSeekProvider({ fetchImpl });
  const reply = await provider.send({ apiKey: KEY, model: 'deepseek-flash', messages: MESSAGES });

  assert.equal(reply.text, 'Halo, Rover!');
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  assert.equal(BASE_URL, 'https://api.deepseek.com');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer ' + KEY);
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.stream, false);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.messages, MESSAGES);
  assert.ok(body.max_tokens > 0);
  assert.ok(!init.body.includes(KEY), 'the key belongs in the header only');
});

test('offers the models named in the DeepSeek docs', () => {
  assert.deepEqual(MODELS.map((m) => m.id), ['deepseek-flash', 'deepseek-v4-pro']);
});

test('declares vision capability as unsupported', () => {
  const provider = createDeepSeekProvider();
  assert.equal(provider.capabilities.vision, false);
  assert.equal(provider.supportsVision(), false);
});

test('maps HTTP statuses to stable error codes', async () => {
  const cases = { 400: 'format', 401: 'auth', 402: 'balance', 422: 'format', 429: 'rate', 500: 'server', 503: 'server' };
  for (const [status, code] of Object.entries(cases)) {
    const provider = createDeepSeekProvider({
      fetchImpl: fakeFetch(() => jsonResponse(Number(status), { error: { message: 'x' } })),
    });
    const error = await failure(provider, { apiKey: KEY, model: 'm', messages: MESSAGES });
    assert.equal(error.code, code, 'status ' + status);
  }
});

test('an error body that echoes the key never leaks it', async () => {
  const provider = createDeepSeekProvider({
    fetchImpl: fakeFetch(() =>
      jsonResponse(400, { error: { message: 'bad request for ' + KEY + ' sorry' } }),
    ),
  });
  const error = await failure(provider, { apiKey: KEY, model: 'm', messages: MESSAGES });
  assert.ok(!error.message.includes(KEY));
  assert.ok(!String(error.stack).includes(KEY));
});

test('network failures and aborts become friendly errors without the key', async () => {
  const down = createDeepSeekProvider({
    fetchImpl: fakeFetch(() => {
      throw new Error('connect ECONNREFUSED while sending ' + KEY);
    }),
  });
  const network = await failure(down, { apiKey: KEY, model: 'm', messages: MESSAGES });
  assert.equal(network.code, 'network');
  assert.ok(!network.message.includes(KEY));

  const aborted = createDeepSeekProvider({
    fetchImpl: fakeFetch(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }),
  });
  assert.equal((await failure(aborted, { apiKey: KEY, model: 'm', messages: MESSAGES })).code, 'timeout');
});

test('an empty or malformed success response is reported, not returned', async () => {
  for (const body of [{ choices: [] }, { choices: [{ message: { content: '   ' } }] }, {}]) {
    const provider = createDeepSeekProvider({ fetchImpl: fakeFetch(() => jsonResponse(200, body)) });
    assert.equal((await failure(provider, { apiKey: KEY, model: 'm', messages: MESSAGES })).code, 'empty');
  }
  const broken = createDeepSeekProvider({
    fetchImpl: fakeFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    })),
  });
  assert.equal((await failure(broken, { apiKey: KEY, model: 'm', messages: MESSAGES })).code, 'format');
});
