'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeminiProvider, formatGeminiPayload, BASE_URL, MODELS } = require('../src/chat/providers/gemini');
const { createProviders } = require('../src/chat/providers');
const { ChatError } = require('../src/chat/chat-error');

const KEY = 'AIzaSyFakeGeminiKey-1234567890';
const MESSAGES = [
  { role: 'system', content: 'Kamu adalah Aemeath' },
  { role: 'user', content: 'Apa ini?' },
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

test('formatGeminiPayload formats system prompt, user text, and image inline_data', () => {
  const attachments = [
    { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' },
  ];
  const payload = formatGeminiPayload(MESSAGES, attachments, 600);

  assert.deepEqual(payload.system_instruction, {
    parts: [{ text: 'Kamu adalah Aemeath' }],
  });
  assert.equal(payload.contents.length, 1);
  assert.equal(payload.contents[0].role, 'user');
  assert.equal(payload.contents[0].parts.length, 2);
  assert.equal(payload.contents[0].parts[0].text, 'Apa ini?');
  assert.deepEqual(payload.contents[0].parts[1].inline_data, {
    mime_type: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUg==',
  });
});

test('sends non-streaming payload to Gemini generateContent endpoint with x-goog-api-key header', async () => {
  const fetchImpl = fakeFetch(() =>
    jsonResponse(200, {
      candidates: [
        { content: { parts: [{ text: 'Ini adalah gambar kristal resonansi.' }] } },
      ],
    }),
  );
  const provider = createGeminiProvider({ fetchImpl });
  const reply = await provider.send({
    apiKey: KEY,
    model: 'gemini-2.5-flash',
    messages: MESSAGES,
    attachments: [{ mimeType: 'image/png', data: 'abc' }],
  });

  assert.equal(reply.text, 'Ini adalah gambar kristal resonansi.');
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, `${BASE_URL}/models/gemini-2.5-flash:generateContent`);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.equal(init.headers['Content-Type'], 'application/json');

  const body = JSON.parse(init.body);
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].parts[0].text, 'Apa ini?');
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/png');
  assert.ok(!init.body.includes(KEY), 'api key should be in header, not body');
});

test('supports vision on all official Gemini models', () => {
  const provider = createGeminiProvider();
  assert.equal(provider.capabilities.vision, true);
  for (const model of MODELS) {
    assert.equal(provider.supportsVision(model.id), true, 'model ' + model.id + ' should support vision');
  }
  assert.equal(provider.supportsVision('unknown-model'), false);
});

test('streams response via SSE', async () => {
  const sseChunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Halo "}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"Rover!"}]}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  let chunkIndex = 0;
  const mockReader = {
    read: async () => {
      if (chunkIndex >= sseChunks.length) {
        return { done: true, value: undefined };
      }
      const val = new TextEncoder().encode(sseChunks[chunkIndex++]);
      return { done: false, value: val };
    },
    releaseLock: () => {},
  };

  const fetchImpl = fakeFetch(() => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => mockReader,
    },
  }));

  const provider = createGeminiProvider({ fetchImpl });
  const received = [];
  const reply = await provider.send({
    apiKey: KEY,
    model: 'gemini-2.5-flash',
    messages: MESSAGES,
    onChunk: (chunk) => received.push(chunk),
  });

  assert.equal(reply.text, 'Halo Rover!');
  assert.deepEqual(received, ['Halo ', 'Rover!']);
  assert.ok(fetchImpl.calls[0].url.includes(':streamGenerateContent?alt=sse'));
});

test('maps HTTP statuses to stable error codes', async () => {
  const cases = {
    400: 'format',
    401: 'auth',
    403: 'auth',
    422: 'format',
    429: 'rate',
    500: 'server',
    503: 'server',
  };
  for (const [status, code] of Object.entries(cases)) {
    const provider = createGeminiProvider({
      fetchImpl: fakeFetch(() =>
        jsonResponse(Number(status), { error: { message: 'error detail' } }),
      ),
    });
    const error = await failure(provider, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES });
    assert.equal(error.code, code, 'status ' + status);
  }
});

test('an error body that echoes the key never leaks it', async () => {
  const provider = createGeminiProvider({
    fetchImpl: fakeFetch(() =>
      jsonResponse(400, { error: { message: 'Invalid request with key ' + KEY } }),
    ),
  });
  const error = await failure(provider, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES });
  assert.ok(!error.message.includes(KEY));
  assert.ok(!String(error.stack).includes(KEY));
});

test('network failures and aborts become friendly errors', async () => {
  const down = createGeminiProvider({
    fetchImpl: fakeFetch(() => {
      throw new Error('connect ECONNREFUSED ' + KEY);
    }),
  });
  const network = await failure(down, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES });
  assert.equal(network.code, 'network');
  assert.ok(!network.message.includes(KEY));

  const aborted = createGeminiProvider({
    fetchImpl: fakeFetch(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }),
  });
  assert.equal(
    (await failure(aborted, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES })).code,
    'timeout',
  );
});

test('empty or malformed success response is reported as ChatError', async () => {
  for (const body of [{ candidates: [] }, { candidates: [{ content: { parts: [{ text: '   ' }] } }] }, {}]) {
    const provider = createGeminiProvider({ fetchImpl: fakeFetch(() => jsonResponse(200, body)) });
    assert.equal(
      (await failure(provider, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES })).code,
      'empty',
    );
  }
  const broken = createGeminiProvider({
    fetchImpl: fakeFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    })),
  });
  assert.equal(
    (await failure(broken, { apiKey: KEY, model: 'gemini-2.5-flash', messages: MESSAGES })).code,
    'format',
  );
});

test('createProviders registry includes Gemini provider', () => {
  const providers = createProviders();
  const gemini = providers.get('gemini');
  assert.ok(gemini);
  assert.equal(gemini.id, 'gemini');
  assert.equal(gemini.name, 'Google Gemini');
  assert.equal(gemini.capabilities.vision, true);
  assert.equal(gemini.supportsVision('gemini-2.5-flash'), true);
  assert.equal(providers.defaultId, 'deepseek');
});
