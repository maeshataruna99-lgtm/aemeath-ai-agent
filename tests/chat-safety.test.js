'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { isUnsafe, deflection } = require('../src/chat/safety');
const { createChatService } = require('../src/chat/chat-service');
const { buildSystemPrompt } = require('../src/chat/persona');
const { loadLorebook } = require('../src/lorebook-loader');

const KEY = 'sk-test-0123456789abcdef';

function service(reply) {
  const sent = [];
  const provider = {
    id: 'fake',
    name: 'Fake',
    defaultModel: 'm',
    send: async (request) => {
      sent.push(request);
      return { text: reply };
    },
  };
  const chat = createChatService({
    providers: { get: () => provider },
    getKey: () => KEY,
    getConfig: () => ({ provider: 'fake', model: 'm' }),
    getKnowledge: () => [{ topic: 'Tes', text: 'Fakta uji coba.' }],
  });
  return { chat, sent };
}

test('flags explicit terms but not ordinary words that merely look similar', () => {
  for (const bad of ['kirim bokep dong', 'ini NSFW', 'Sexy banget', 'cerita seks', 'dia telanjang']) {
    assert.equal(isUnsafe(bad), true, bad);
  }
  for (const fine of [
    'Ceritakan tentang Roya Frostlands',
    'Siapa Sextant di game ini?',
    'Aku sekian lama menunggu',
    'Essex adalah kota',
    'Apa itu Tacet Discord?',
    '',
  ]) {
    assert.equal(isUnsafe(fine), false, fine);
  }
});

test('an inappropriate message is deflected locally and never sent or remembered', async () => {
  const { chat, sent } = service('jawaban normal');
  const result = await chat.send('kirim bokep');
  assert.equal(result.filtered, true);
  assert.equal(result.text, deflection(1));
  assert.equal(sent.length, 0, 'nothing may reach the provider');
  assert.equal(chat.historyLength, 0);
});

test('an inappropriate model reply is replaced before the user or history sees it', async () => {
  const { chat } = service('ini konten porno');
  const result = await chat.send('halo');
  assert.ok(!/porno/i.test(result.text));
  assert.ok(result.text.length > 0);
  assert.equal(chat.historyLength, 2);
});

test('the lorebook knowledge is part of the system prompt', async () => {
  const { chat, sent } = service('halo');
  await chat.send('apa kabar');
  const system = sent[0].messages[0].content;
  assert.match(system, /Catatan pengetahuan/);
  assert.match(system, /\[Tes\] Fakta uji coba\./);
});

test('the persona makes Rover a guardian, keeps it all-ages and prioritises Wuthering Waves info', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /sosok wali/);
  assert.match(prompt, /kekeluargaan/);
  assert.match(prompt, /segala usia/);
  assert.match(prompt, /Wuthering Waves yang akurat dan berguna/);
  assert.match(prompt, /Jangan mengarang fakta/);
  assert.match(prompt, /Jangan menolak pertanyaan sederhana tentang kesukaanmu/);
});

test('the whole shipped lorebook fits in the prompt and every topic is included', () => {
  const data = loadLorebook(path.join(__dirname, '..', 'lorebook'));
  const prompt = buildSystemPrompt(data.entries);
  for (const entry of data.entries) assert.ok(prompt.includes(entry.text), entry.id);
  assert.ok(prompt.length < 16000, 'prompt is ' + prompt.length + ' characters');
  assert.match(prompt, /Roya|Lahai-Roi/);
});
