'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatService } = require('../src/chat/chat-service');
const { buildSystemPrompt, LOCALE_DIRECTIVES } = require('../src/chat/persona');
const { createLocalResponder } = require('../src/chat/local-responder');
const { ChatError } = require('../src/chat/chat-error');

function mockProvider(replyFn) {
  return {
    id: 'mock',
    name: 'Mock Provider',
    defaultModel: 'mock-model',
    models: [{ id: 'mock-model' }],
    capabilities: { vision: true },
    send: async (req) => {
      if (typeof replyFn === 'function') return replyFn(req);
      return { text: 'Mock response to: ' + req.messages[req.messages.length - 1].content };
    },
  };
}

function mockProviders(provider) {
  return {
    get: (id) => (id === provider.id ? provider : null),
    defaultId: provider.id,
    list: [provider],
  };
}

test('buildSystemPrompt inserts language directives matching the active locale', () => {
  const promptId = buildSystemPrompt([], { locale: 'id-ID' });
  assert.match(promptId, /Pakai Bahasa Indonesia yang santai/);

  const promptEn = buildSystemPrompt([], { locale: 'en-US' });
  assert.match(promptEn, /Default response language: Respond in English by default/);

  // Core personality remains present in both
  for (const prompt of [promptId, promptEn]) {
    assert.match(prompt, /Kamu adalah Aemeath/);
    assert.match(prompt, /Panggil dia "Rover"/);
    assert.match(prompt, /Batasan keras: obrolan harus ramah untuk segala usia/);
  }
});

test('chatService passes active locale to system prompt', async () => {
  let capturedMessages = null;
  const provider = mockProvider((req) => {
    capturedMessages = req.messages;
    return { text: 'Hello Rover, this is an English response!' };
  });

  let currentLocale = 'en-US';
  const chat = createChatService({
    providers: mockProviders(provider),
    getKey: () => 'test-key',
    getConfig: () => ({ provider: 'mock', model: 'mock-model' }),
    getLocale: () => currentLocale,
  });

  const res = await chat.send('Hello Aemeath!');
  assert.equal(res.text, 'Hello Rover, this is an English response!');
  assert.ok(capturedMessages);
  const sysMsg = capturedMessages.find((m) => m.role === 'system');
  assert.ok(sysMsg);
  assert.match(sysMsg.content, /Default response language: Respond in English by default/);
});

test('chatService preserves history immutability across locale changes', async () => {
  const replies = ['Jawaban pertama dalam Bahasa Indonesia.', 'Second response in English.'];
  let callCount = 0;
  const provider = mockProvider(() => {
    const text = replies[callCount++] || 'Fallback reply';
    return { text };
  });

  let currentLocale = 'id-ID';
  const chat = createChatService({
    providers: mockProviders(provider),
    getKey: () => 'test-key',
    getConfig: () => ({ provider: 'mock', model: 'mock-model' }),
    getLocale: () => currentLocale,
  });

  // Turn 1 in Indonesian
  await chat.send('Pesan pertama');
  assert.equal(chat.historyLength, 2);
  const h1 = chat.history;
  assert.equal(h1[0].content, 'Pesan pertama');
  assert.equal(h1[1].content, 'Jawaban pertama dalam Bahasa Indonesia.');

  // Switch locale to English
  currentLocale = 'en-US';

  // Verify prior history is completely untouched
  const h1AfterSwitch = chat.history;
  assert.deepEqual(h1AfterSwitch, h1, 'History must not be mutated or retranslated on locale switch');

  // Turn 2 in English
  await chat.send('Second message');
  assert.equal(chat.historyLength, 4);
  const h2 = chat.history;
  assert.equal(h2[0].content, 'Pesan pertama');
  assert.equal(h2[1].content, 'Jawaban pertama dalam Bahasa Indonesia.');
  assert.equal(h2[2].content, 'Second message');
  assert.equal(h2[3].content, 'Second response in English.');
});

test('chatService throws localized errors matching active locale', async () => {
  const provider = mockProvider();

  let currentLocale = 'id-ID';
  const chat = createChatService({
    providers: mockProviders(provider),
    getKey: () => null, // no key
    getConfig: () => ({ provider: 'mock', model: 'mock-model' }),
    getLocale: () => currentLocale,
    getFeatures: () => ({ offlineFallback: false }),
  });

  // id-ID errors
  await assert.rejects(
    () => chat.send(''),
    (err) => err instanceof ChatError && err.code === 'empty-input' && err.message.includes('Tulis sesuatu dulu')
  );
  await assert.rejects(
    () => chat.send('Halo!'),
    (err) => err instanceof ChatError && err.code === 'no-key' && err.message.includes('Belum ada kunci API')
  );

  // Switch to en-US
  currentLocale = 'en-US';
  await assert.rejects(
    () => chat.send(''),
    (err) => err instanceof ChatError && err.code === 'empty-input' && err.message.includes('Please write something first')
  );
  await assert.rejects(
    () => chat.send('Hello!'),
    (err) => err instanceof ChatError && err.code === 'no-key' && err.message.includes('No API key for')
  );
});

test('localResponder responds in English when locale is en-US', () => {
  const responder = createLocalResponder({
    getEntries: () => [],
    locale: 'en-US',
  });

  const hello = responder.respond('hello Aemeath');
  assert.equal(hello.matched, false);
  assert.match(hello.text, /Hi, Rover!|Hello Rover!/);

  const unknown = responder.respond('What is the secret recipe for quantum cakes?', 'no-key');
  assert.equal(unknown.matched, false);
  assert.match(unknown.text, /recollections|Settings|API key/);
  // Ensure no forbidden words
  assert.doesNotMatch(unknown.text, /\bsistem\b/i);
  assert.doesNotMatch(unknown.text, /\bdatabase\b/i);
  assert.doesNotMatch(unknown.text, /\bmemori\b/i);
});
