'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatService, MAX_INPUT } = require('../src/chat/chat-service');
const { createProviders } = require('../src/chat/providers');
const { ChatError } = require('../src/chat/chat-error');
const { buildSystemPrompt } = require('../src/chat/persona');

const KEY = 'sk-test-0123456789abcdef';

function service(overrides) {
  const sent = [];
  const providers = {
    get: (id) =>
      id === 'fake'
        ? {
            id: 'fake',
            name: 'Fake',
            defaultModel: 'fake-1',
            send: async (request) => {
              sent.push(request);
              if (overrides && overrides.send) return overrides.send(request);
              return { text: 'jawaban ' + sent.length };
            },
          }
        : null,
  };
  const chat = createChatService(
    Object.assign(
      {
        providers,
        getKey: (id) => (overrides && 'key' in overrides ? overrides.key : KEY),
        getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
      },
      overrides && overrides.options,
    ),
  );
  return { chat, sent };
}

async function code(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ChatError);
    return error.code;
  }
  return null;
}

test('sends the persona first, then history, then the new message', async () => {
  const { chat, sent } = service();
  assert.deepEqual(await chat.send('  halo  '), { text: 'jawaban 1', mode: 'ai', sources: [] });
  await chat.send('kabar?');

  const second = sent[1].messages;
  assert.equal(second[0].role, 'system');
  assert.equal(second[0].content, buildSystemPrompt());
  assert.deepEqual(second.slice(1).map((m) => [m.role, m.content]), [
    ['user', 'halo'],
    ['assistant', 'jawaban 1'],
    ['user', 'kabar?'],
  ]);
  assert.equal(sent[1].apiKey, KEY);
  assert.equal(sent[1].model, 'fake-1');
});

test('keeps only the most recent messages for context', async () => {
  const { chat, sent } = service({ options: { maxHistory: 4 } });
  for (let i = 0; i < 6; i++) await chat.send('pesan ' + i);
  assert.equal(chat.historyLength, 4);
  const last = sent[sent.length - 1].messages.map((m) => m.content);
  assert.ok(!last.includes('pesan 0'));
  assert.ok(last.includes('pesan 4') && last.includes('pesan 5'));
});

test('a failed request does not enter the history and frees the service', async () => {
  let fail = true;
  const { chat } = service({
    send: async () => {
      if (fail) throw new ChatError('server', 'down');
      return { text: 'ok' };
    },
  });
  assert.equal(await code(chat.send('halo')), 'server');
  assert.equal(chat.historyLength, 0);
  assert.equal(chat.busy, false);
  fail = false;
  assert.deepEqual(await chat.send('lagi'), { text: 'ok', mode: 'ai', sources: [] });
});

test('rejects empty, oversized and concurrent messages', async () => {
  let release;
  const { chat } = service({ send: () => new Promise((resolve) => (release = () => resolve({ text: 'x' }))) });
  assert.equal(await code(chat.send('   ')), 'empty-input');
  assert.equal(await code(chat.send('a'.repeat(MAX_INPUT + 1))), 'too-long');

  const first = chat.send('satu');
  assert.equal(await code(chat.send('dua')), 'busy');
  release();
  await first;
});

test('without a key nothing is sent', async () => {
  const { chat, sent } = service({ key: null });
  assert.equal(await code(chat.send('halo')), 'no-key');
  assert.equal(sent.length, 0);
});

test('an unexpected provider error is redacted before it reaches the user', async () => {
  const { chat } = service({
    send: async () => {
      throw new Error('boom ' + KEY);
    },
  });
  try {
    await chat.send('halo');
    assert.fail('should throw');
  } catch (error) {
    assert.equal(error.code, 'unknown');
    assert.ok(!error.message.includes(KEY));
  }
});

test('reset clears the conversation', async () => {
  const { chat } = service();
  await chat.send('halo');
  chat.reset();
  assert.equal(chat.historyLength, 0);
});

test('timeouts abort the request', async () => {
  const { chat } = service({
    options: { timeoutMs: 20 },
    send: (request) =>
      new Promise((resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });
  assert.equal(await code(chat.send('halo')), 'unknown');
});

test('the registry knows DeepSeek and nothing else yet', () => {
  const providers = createProviders({ fetchImpl: async () => ({}) });
  assert.equal(providers.defaultId, 'deepseek');
  assert.equal(providers.get('deepseek').name, 'DeepSeek');
  assert.equal(providers.get('nope'), null);
});

test('the persona stays in character and discloses being an AI when sincerely asked', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Aemeath/);
  assert.match(prompt, /Rover/);
  assert.match(prompt, /Bahasa Indonesia/);
  assert.match(prompt, /pet buatan penggemar yang ditenagai model AI/);
});
