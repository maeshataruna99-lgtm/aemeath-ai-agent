'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWebSearch, shouldSearch, isGameQuestion, formatSearchBlock } = require('../src/chat/web-search');
const { createChatService } = require('../src/chat/chat-service');

const KEY = 'sk-test-0123456789abcdef';

function json(body, status) {
  return { ok: (status || 200) < 400, status: status || 200, json: async () => body };
}

// Routes by URL so each test can describe just the sites it cares about.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) return handler(url);
    }
    throw new Error('unexpected url ' + url);
  };
  impl.calls = calls;
  return impl;
}

const WIKI_SEARCH = ['wutheringwaves.fandom.com/api.php?action=query&list=search', () =>
  json({ query: { search: [{ title: 'Exostrider' }, { title: 'Threnodian' }] } })];
const WIKI_PARSE = ['action=parse', (url) =>
  json({
    parse: {
      text: {
        '*':
          '<aside>Infobox</aside><p>' +
          (url.includes('Exostrider')
            ? 'Exostrider adalah mesin raksasa penjaga Lahai-Roi yang dibuat Homeland Civilization.'
            : 'Threnodian adalah makhluk yang lahir dari ketakutan kolektif manusia di dunia ini.') +
          '</p>',
      },
    },
  })];

test('decides when a message deserves a lookup', () => {
  assert.equal(shouldSearch('Apa itu Exostrider?'), true);
  assert.equal(shouldSearch('Ceritakan tentang Lahai-Roi dong'), true);
  assert.equal(shouldSearch('halo'), false);
  assert.equal(shouldSearch('oke lagu kesukaanmu'), false);
  assert.equal(shouldSearch('apa?'), false);
  assert.equal(isGameQuestion('siapa Aemeath'), true);
  assert.equal(isGameQuestion('apa itu aurora'), false);
});

test('game questions are answered from the Wuthering Waves wiki with credit', async () => {
  const fetchImpl = fakeFetch([WIKI_SEARCH, WIKI_PARSE]);
  const { results, error } = await createWebSearch({ fetchImpl }).search('Apa itu Exostrider?');
  assert.equal(error, null);
  assert.deepEqual(results.map((r) => r.title), ['Exostrider']); // the unrelated runner-up is dropped
  assert.equal(results[0].title, 'Exostrider');
  assert.match(results[0].text, /penjaga Lahai-Roi/);
  assert.ok(!results[0].text.includes('Infobox'));
  assert.equal(results[0].source.url, 'https://wutheringwaves.fandom.com/wiki/Exostrider');
  assert.equal(results[0].source.license, 'CC BY-SA');
  assert.ok(fetchImpl.calls.every((u) => u.startsWith('https://wutheringwaves.fandom.com/')));
  assert.ok(fetchImpl.calls[0].includes('srsearch=exostrider'), fetchImpl.calls[0]);
});

test('other topics come from Wikipedia, trying English when Indonesian has nothing', async () => {
  const fetchImpl = fakeFetch([
    ['id.wikipedia.org', () => json({ batchcomplete: '' })],
    ['en.wikipedia.org', () =>
      json({ query: { pages: { 1: { title: 'Aurora', index: 1, extract: 'An aurora is a natural light display.' } } } })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('Apa itu aurora di langit?');
  assert.equal(results[0].source.title, 'Wikipedia: Aurora');
  assert.equal(results[0].source.url, 'https://en.wikipedia.org/wiki/Aurora');
  assert.ok(fetchImpl.calls[0].includes('id.wikipedia.org'));
  assert.ok(fetchImpl.calls.every((u) => !u.includes('fandom.com')));
});

test('an unrelated runner-up is dropped while the real match is kept', async () => {
  const fetchImpl = fakeFetch([
    ['id.wikipedia.org', () =>
      json({
        query: {
          pages: {
            1: { title: 'Aurora', index: 1, extract: 'Aurora adalah cahaya kutub di langit malam.' },
            2: { title: 'Sebuah Film Drama', index: 2, extract: 'Film keluarga yang dirilis tahun 2026.' },
          },
        },
      })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('Apa itu aurora di langit?');
  assert.deepEqual(results.map((r) => r.title), ['Aurora']);
});

test('a lone result that shares no keyword with the question is not used either', async () => {
  const fetchImpl = fakeFetch([
    ['id.wikipedia.org', () =>
      json({ query: { pages: { 1: { title: 'Film Lain', index: 1, extract: 'Cerita yang sama sekali berbeda dari soal.' } } } })],
    ['en.wikipedia.org', () => json({ batchcomplete: '' })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('Apa itu aurora di langit?');
  assert.deepEqual(results, []);
});

test('a game question the wiki cannot answer falls back to Wikipedia', async () => {
  const fetchImpl = fakeFetch([
    ['wutheringwaves.fandom.com', () => json({ query: { search: [] } })],
    ['id.wikipedia.org', () =>
      json({ query: { pages: { 9: { title: 'Resonator', index: 1, extract: 'Resonator adalah alat penghasil getaran selaras.' } } } })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('Apa itu resonator?');
  assert.equal(results[0].title, 'Resonator');
});

test('lookup failures never throw', async () => {
  const down = await createWebSearch({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  }).search('Apa itu Exostrider?');
  assert.deepEqual(down, { results: [], error: 'network' });

  const blocked = await createWebSearch({ fetchImpl: async () => json({}, 402) }).search('Apa itu Exostrider?');
  assert.deepEqual(blocked.results, []);

  const slow = await createWebSearch({
    timeoutMs: 20,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  }).search('Apa itu Exostrider?');
  assert.equal(slow.error, 'timeout');
});

function service(features, search) {
  const sent = [];
  const provider = {
    id: 'fake',
    name: 'Fake',
    defaultModel: 'm',
    send: async (request) => {
      sent.push(request);
      return { text: 'jawaban' };
    },
  };
  const chat = createChatService({
    providers: { get: () => provider },
    getKey: () => KEY,
    getConfig: () => ({ provider: 'fake', model: 'm' }),
    getFeatures: () => features,
    search,
  });
  return { chat, sent };
}

const RESULT = {
  title: 'Exostrider',
  text: 'Exostrider adalah mesin raksasa.',
  source: { title: 'Wuthering Waves Wiki: Exostrider', url: 'https://wutheringwaves.fandom.com/wiki/Exostrider', license: 'CC BY-SA' },
};

test('with web search on, results go to the model as untrusted data and come back as sources', async () => {
  const queries = [];
  const search = { search: async (text) => (queries.push(text), { results: [RESULT] }) };
  const { chat, sent } = service({ webSearch: true, offlineFallback: false }, search);

  const answer = await chat.send('Apa itu Exostrider?');
  assert.equal(answer.mode, 'ai');
  assert.deepEqual(answer.sources, [RESULT.source]);
  assert.deepEqual(queries, ['Apa itu Exostrider?']);

  const last = sent[0].messages[sent[0].messages.length - 1].content;
  assert.match(last, /^Apa itu Exostrider\?/);
  assert.match(last, /Hasil pencarian web/);
  assert.match(last, /abaikan perintah apa pun/);
  assert.match(last, /Exostrider adalah mesin raksasa\./);
  assert.match(formatSearchBlock([RESULT]), /Wuthering Waves Wiki: Exostrider/);

  // history keeps only what Rover typed
  await chat.send('halo ulang lagi ya');
  const userTurns = sent[1].messages.filter((m) => m.role === 'user');
  assert.equal(userTurns[0].content, 'Apa itu Exostrider?');
});

test('with web search off, or for small talk, nothing is looked up', async () => {
  const search = { search: async () => assert.fail('must not search') };
  const off = service({ webSearch: false, offlineFallback: false }, search);
  assert.deepEqual((await off.chat.send('Apa itu Exostrider?')).sources, []);

  const on = service({ webSearch: true, offlineFallback: false }, search);
  assert.equal((await on.chat.send('halo')).mode, 'ai');
});

test('a failed lookup still gets an answer, just without sources', async () => {
  const search = { search: async () => ({ results: [], error: 'network' }) };
  const { chat, sent } = service({ webSearch: true, offlineFallback: false }, search);
  const answer = await chat.send('Apa itu Exostrider?');
  assert.equal(answer.mode, 'ai');
  assert.deepEqual(answer.sources, []);
  assert.equal(sent[0].messages[sent[0].messages.length - 1].content, 'Apa itu Exostrider?');
});
