'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCompanionMode } = require('../src/chat/companion-mode');
const { createChatService } = require('../src/chat/chat-service');
const { createCommandHandler } = require('../src/commands/command-handler');
const { buildSystemPrompt } = require('../src/chat/persona');
const { createWebSearch, shouldSearch, topicOf, plainText, cookbookText } = require('../src/chat/web-search');

const KEY = 'sk-test-0123456789abcdef';

function mode(initial) {
  const state = { on: Boolean(initial && initial.on), key: !initial || initial.key !== false };
  const companion = createCompanionMode({
    isOn: () => state.on,
    setOn: (on) => {
      state.on = on;
    },
    hasKey: () => state.key,
    providerName: () => 'DeepSeek',
  });
  return { companion, state };
}

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}

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

// ---- /change-mode-search ------------------------------------------------------

test('toggles companion mode on and off when a key exists', async () => {
  const { companion, state } = mode();
  const on = await companion.run('');
  assert.equal(on.ok, true);
  assert.match(on.text, /Mode pendamping aktif/);
  assert.equal(state.on, true);
  assert.equal(companion.active(), true);
  assert.equal('mode' in on, false); // the chat box must not switch to terminal or anything else

  const off = await companion.run('');
  assert.equal(off.ok, true);
  assert.match(off.text, /wiki Wuthering Waves/);
  assert.equal(state.on, false);
  assert.equal(companion.active(), false);
});

test('refuses to turn on without an API key and stays inactive', async () => {
  const { companion, state } = mode({ key: false });
  const result = await companion.run('');
  assert.equal(result.ok, false);
  assert.match(result.text, /kunci API DeepSeek/);
  assert.equal(state.on, false);
  assert.equal((await companion.run('on')).ok, false);
  assert.equal(state.on, false);
});

test('a saved choice is not in effect once the key is removed', async () => {
  const { companion, state } = mode({ on: true });
  assert.equal(companion.active(), true);
  state.key = false;
  assert.equal(companion.active(), false);
  assert.match((await companion.run('status')).text, /butuh model AI/);
  // turning it off always works, key or not
  assert.equal((await companion.run('off')).ok, true);
  assert.equal(state.on, false);
});

test('understands on, off, status and rejects anything else', async () => {
  const { companion, state } = mode();
  await companion.run('on');
  assert.equal(state.on, true);
  await companion.run('on'); // explicit on stays on instead of toggling
  assert.equal(state.on, true);
  assert.match((await companion.run('status')).text, /sedang aktif/);
  await companion.run('mati');
  assert.equal(state.on, false);
  assert.equal((await companion.run('ngawur')).ok, false);
  assert.equal(state.on, false);
});

test('the command handler routes /change-mode-search to the builtin, not /change-mode', async () => {
  const { companion } = mode();
  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: {
      'change-mode': { description: 'terminal', run: async () => ({ ok: true, text: 'terminal', mode: 'terminal' }) },
      'change-mode-search': { description: 'companion', run: (arg) => companion.run(arg) },
    },
  });
  const answer = await handler.handle('/change-mode-search');
  assert.equal(answer.isCommand, true);
  assert.equal(answer.mode, undefined);
  assert.match(answer.text, /Mode pendamping aktif/);
  assert.match((await handler.handle('/CHANGE-MODE-SEARCH status')).text, /sedang aktif/);
});

// ---- persona ------------------------------------------------------------------

test('the companion persona drops the wiki-only focus but keeps character and limits', () => {
  const wiki = buildSystemPrompt();
  const companion = buildSystemPrompt([], { companion: true });
  assert.notEqual(wiki, companion);
  assert.match(wiki, /sarankan Rover mengecek wiki/);
  assert.doesNotMatch(companion, /Prioritas utamamu adalah menjadi sumber info Wuthering Waves/);
  assert.match(companion, /mode pendamping penuh/);
  assert.match(companion, /ngoding/);
  assert.match(companion, /resep/);
  for (const prompt of [wiki, companion]) {
    assert.match(prompt, /Aemeath/);
    assert.match(prompt, /Batasan keras/);
    assert.match(prompt, /pet buatan penggemar yang ditenagai model AI/);
  }
  const withNotes = buildSystemPrompt([{ topic: 'lore', text: 'Lahai-Roi bersalju.' }], { companion: true });
  assert.match(withNotes, /Lahai-Roi bersalju/);
});

// ---- chat service -------------------------------------------------------------

function chatWith(features) {
  const sent = [];
  const searched = [];
  const chat = createChatService({
    providers: {
      get: () => ({
        id: 'fake',
        name: 'Fake',
        defaultModel: 'fake-1',
        send: async (request) => {
          sent.push(request);
          return { text: 'jawaban' };
        },
      }),
    },
    getKey: () => KEY,
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
    getFeatures: () => features,
    search: {
      search: async (text, options) => {
        searched.push({ text, options });
        return { results: [] };
      },
    },
  });
  return { chat, sent, searched };
}

test('companion mode changes the system prompt and widens the search', async () => {
  const { chat, sent, searched } = chatWith({ webSearch: true, companion: true });
  await chat.send('cara masak nasi goreng enak');
  assert.equal(sent[0].messages[0].content, buildSystemPrompt([], { companion: true }));
  assert.equal(searched.length, 1);
  assert.deepEqual(searched[0].options, { companion: true, apiKey: KEY });
});

test('without companion mode the wiki persona is used and how-to text is not searched', async () => {
  const { chat, sent, searched } = chatWith({ webSearch: true });
  await chat.send('cara masak nasi goreng enak');
  assert.equal(sent[0].messages[0].content, buildSystemPrompt());
  assert.equal(searched.length, 0);
});

// ---- web search ---------------------------------------------------------------

test('companion mode treats how-to requests as searchable and picks a topic', () => {
  assert.equal(shouldSearch('cara masak nasi goreng'), false);
  assert.equal(shouldSearch('cara masak nasi goreng', { companion: true }), true);
  assert.equal(shouldSearch('halo', { companion: true }), false);
  assert.equal(topicOf('error javascript array undefined'), 'coding');
  assert.equal(topicOf('resep nasi goreng'), 'cooking');
  assert.equal(topicOf('sejarah candi borobudur'), 'general');
});

test('coding questions in companion mode use Stack Overflow with credit', async () => {
  const fetchImpl = fakeFetch([
    ['/search/advanced', () =>
      json({
        items: [
          { title: 'Remove duplicate values from a JavaScript array', accepted_answer_id: 11, link: 'https://stackoverflow.com/q/1' },
          { title: 'No accepted answer here', link: 'https://stackoverflow.com/q/2' },
        ],
      })],
    ['/answers/11', () =>
      json({ items: [{ answer_id: 11, body: '<p>Use a Set:</p><pre><code>const unique = [...new Set(names)];\n</code></pre>' }] })],
  ]);
  const { results, error } = await createWebSearch({ fetchImpl }).search('cara remove duplicate array javascript', { companion: true });
  assert.equal(error, null);
  assert.equal(results.length, 1);
  assert.equal(results[0].source.title, 'Stack Overflow: Remove duplicate values from a JavaScript array');
  assert.equal(results[0].source.license, 'CC BY-SA');
  assert.match(results[0].text, /new Set\(names\)/);
  assert.ok(fetchImpl.calls.every((url) => url.startsWith('https://api.stackexchange.com/2.3/')));
});

test('cooking questions in companion mode use the Wikibooks Cookbook', async () => {
  const fetchImpl = fakeFetch([
    ['en.wikibooks.org', () =>
      json({
        query: {
          pages: {
            1: {
              title: 'Cookbook:Nasi Goreng (Indonesian Fried Rice)',
              extract: 'Cookbook | Recipes | Ingredients\n\n== Ingredients ==\n2 servings of steamed rice\n2 eggs\n',
            },
          },
        },
      })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('resep nasi goreng gimana', { companion: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].source.title, 'Wikibooks Cookbook: Nasi Goreng (Indonesian Fried Rice)');
  assert.match(results[0].text, /^Ingredients:\n2 servings of steamed rice/);
});

test('companion topic sources fall back to Wikipedia when they find nothing', async () => {
  const fetchImpl = fakeFetch([
    ['/search/advanced', () => json({ items: [] })],
    ['duckduckgo.com', () => ({ ok: true, text: async () => '' })],
    ['wikipedia.org', () =>
      json({ query: { pages: { 1: { index: 1, title: 'Python', extract: 'Python adalah bahasa pemrograman tingkat tinggi.' } } } })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('apa itu bahasa python', { companion: true });
  assert.deepEqual(results.map((r) => r.source.title), ['Wikipedia: Python']);
});

test('real-time web search in companion mode uses DeepSeek Search API when key is provided', async () => {
  const fetchImpl = fakeFetch([
    ['api.deepseek.com/v1/tools/search', () =>
      json({
        results: [
          {
            title: 'Max Verstappen Juara Dunia F1 2024',
            url: 'https://f1.example.com/verstappen-2024',
            site_name: 'F1 Official',
            summary: 'Max Verstappen mengunci gelar juara dunia F1 musim 2024 pada GP Las Vegas tanggal 23 November 2024.',
          },
        ],
      })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('juara dunia f1 terakhir tanggal', {
    companion: true,
    apiKey: KEY,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Max Verstappen Juara Dunia F1 2024');
  assert.equal(results[0].source.url, 'https://f1.example.com/verstappen-2024');
  assert.equal(results[0].source.license, 'DeepSeek Search');
  assert.match(results[0].text, /Las Vegas tanggal 23 November 2024/);
});

test('real-time web search in companion mode uses DuckDuckGo', async () => {
  const html = [
    '<div class="links_main links_deep result__body">',
    '  <h2 class="result__title">',
    '    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fstore.steampowered.com%2Fapp%2Fdeadlock">Deadlock on Steam</a>',
    '  </h2>',
    '  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fstore.steampowered.com%2Fapp%2Fdeadlock">Deadlock is a new multiplayer 6v6 hero shooter game from Valve.</a>',
    '</div>',
  ].join('\n');

  const fetchImpl = fakeFetch([
    ['duckduckgo.com', () => ({ ok: true, text: async () => html })],
  ]);
  const { results } = await createWebSearch({ fetchImpl }).search('siapa game Deadlock valve', { companion: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Deadlock on Steam');
  assert.equal(results[0].source.url, 'https://store.steampowered.com/app/deadlock');
  assert.match(results[0].text, /multiplayer 6v6 hero shooter/);
});

test('without companion mode a coding question still goes only to Wikipedia', async () => {
  const fetchImpl = fakeFetch([
    ['wikipedia.org', () => json({ query: { pages: {} } })],
  ]);
  await createWebSearch({ fetchImpl }).search('apa itu error javascript', {});
  assert.ok(fetchImpl.calls.every((url) => url.includes('wikipedia.org')));
});

test('answer and cookbook text helpers clean markup', () => {
  assert.equal(plainText('<p>Hi &amp; bye</p><pre><code>a\nb</code></pre>'), 'Hi & bye\na\nb');
  assert.equal(cookbookText('Cookbook | Recipes\n== Steps ==\nBoil.'), 'Steps:\nBoil.');
});
