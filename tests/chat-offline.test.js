'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadLorebook } = require('../src/lorebook-loader');
const { createLocalResponder } = require('../src/chat/local-responder');
const { createChatService } = require('../src/chat/chat-service');
const { ChatError } = require('../src/chat/chat-error');
const { keywords, normalize } = require('../src/chat/text');

const data = loadLorebook(path.join(__dirname, '..', 'lorebook'));
const entries = data.entries.map((e) => ({
  id: e.id,
  topic: e.topic,
  text: e.text,
  credit: data.sources[e.source],
}));
const KEY = 'sk-test-0123456789abcdef';

function responder() {
  return createLocalResponder({ getEntries: () => entries, rng: () => 0 });
}

test('keywords drop filler words, accents, punctuation and plurals', () => {
  assert.deepEqual(keywords('Apa itu Roya Frostlands?'), ['roya', 'frostland']);
  assert.deepEqual(keywords('Ceritakan tentang Lahai-Roi'), ['lahai', 'roi']);
  assert.equal(normalize('Café—Naïve'), 'cafe naive');
  assert.deepEqual(keywords('apa kabar'), ['kabar']);
});

test('answers lore questions from the lorebook with their sources', () => {
  const cases = {
    'Apa itu Exostrider?': /Exostrider/,
    'Ceritakan tentang Roya Frostlands': /Roya|Lahai-Roi|Frostlands|Sky Ladder/,
    'Siapa itu Threnodian': /Threnodian/,
    'jelaskan Tacet Discord': /Tacet Discord/,
    'apa itu Synchronist': /Synchronist/,
  };
  for (const [question, expected] of Object.entries(cases)) {
    const answer = responder().respond(question, 'no-key');
    assert.equal(answer.matched, true, question);
    assert.match(answer.text, expected, question);
    assert.ok(answer.sources.length >= 1, question);
    for (const source of answer.sources) {
      assert.match(source.url, /^https:\/\/wutheringwaves\.fandom\.com\//);
      assert.equal(source.license, 'CC BY-SA');
    }
  }
});

test('when she does not know she sends Rover to the internet or the API key', () => {
  const noKey = responder().respond('Resep nasi goreng yang enak bagaimana?', 'no-key');
  assert.equal(noKey.matched, false);
  assert.match(noKey.text, /internet/);
  assert.match(noKey.text, /API key/);
  assert.deepEqual(noKey.sources, []);

  const offline = responder().respond('Resep nasi goreng yang enak bagaimana?', 'offline');
  assert.match(offline.text, /Internetnya lagi putus/);
  assert.match(offline.text, /API key/);
});

test('an unrelated question that shares one common word is not forced onto a lore entry', () => {
  const answer = responder().respond('Berapa harga laptop gaming bagus', 'no-key');
  assert.equal(answer.matched, false);
});

test('small talk gets a friendly reply without needing lore', () => {
  for (const hello of ['Halo!', 'hai aemeath', 'Selamat pagi', 'makasih ya', 'apa kabar?', 'siapa kamu?']) {
    const answer = responder().respond(hello, 'no-key');
    assert.ok(answer.text.length > 0, hello);
    assert.equal(answer.matched, false, hello);
  }
});

test('the offline note is added when the network is the reason', () => {
  const answer = responder().respond('Apa itu Exostrider?', 'offline');
  assert.equal(answer.matched, true);
  assert.match(answer.text, /^Internetnya lagi putus/);
});

function service(options) {
  const opts = options || {};
  const sent = [];
  const provider = {
    id: 'fake',
    name: 'Fake',
    defaultModel: 'm',
    send: async (request) => {
      sent.push(request);
      if (opts.send) return opts.send(request);
      return { text: 'jawaban dari model' };
    },
  };
  const chat = createChatService({
    providers: { get: () => provider },
    getKey: () => ('key' in opts ? opts.key : KEY),
    getConfig: () => ({ provider: 'fake', model: 'm' }),
    getFeatures: () => ({ webSearch: false, offlineFallback: opts.fallback !== false }),
    localResponder: responder(),
  });
  return { chat, sent };
}

test('without a key the chat still answers from the lorebook and never calls the provider', async () => {
  const { chat, sent } = service({ key: null });
  const answer = await chat.send('Apa itu Exostrider?');
  assert.equal(answer.mode, 'local');
  assert.match(answer.text, /Exostrider/);
  assert.equal(sent.length, 0);
  assert.equal(chat.historyLength, 0);

  const unknown = await chat.send('Siapa presiden pertama Amerika?');
  assert.equal(unknown.mode, 'local');
  assert.match(unknown.text, /API key/);
});

test('with the fallback switched off, a missing key is still an error', async () => {
  const { chat } = service({ key: null, fallback: false });
  await assert.rejects(chat.send('halo'), (error) => error.code === 'no-key');
});

test('losing the internet mid-chat falls back to the lorebook, other errors do not', async () => {
  const offline = service({
    send: async () => {
      throw new ChatError('network', 'down');
    },
  });
  const answer = await offline.chat.send('Apa itu Exostrider?');
  assert.equal(answer.mode, 'local');
  assert.match(answer.text, /Internetnya lagi putus/);
  assert.equal(offline.chat.historyLength, 0);

  const timedOut = service({
    send: async () => {
      throw new ChatError('timeout', 'slow');
    },
  });
  assert.equal((await timedOut.chat.send('Apa itu Exostrider?')).mode, 'local');

  const badKey = service({
    send: async () => {
      throw new ChatError('auth', 'ditolak');
    },
  });
  await assert.rejects(badKey.chat.send('Apa itu Exostrider?'), (error) => error.code === 'auth');
});

test('a working key keeps using the model, not the lorebook', async () => {
  const { chat, sent } = service();
  const answer = await chat.send('Apa itu Exostrider?');
  assert.equal(answer.mode, 'ai');
  assert.equal(answer.text, 'jawaban dari model');
  assert.equal(sent.length, 1);
});
