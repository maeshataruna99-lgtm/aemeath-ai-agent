'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatService } = require('../src/chat/chat-service');
const { ChatError } = require('../src/chat/chat-error');

const KEY = 'sk-super-secret-api-key-999999';
const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13,
  0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 10,
  0, 0, 0, 10,
  8, 2, 0, 0, 0,
  0, 0, 0, 0,
]);

test('IMG-23: raw image binary/base64 never leaks into chat history', async () => {
  let capturedRequest = null;
  const providers = {
    get: () => ({
      id: 'vision-p',
      name: 'Vision Provider',
      defaultModel: 'v-1',
      supportsVision: () => true,
      send: async (req) => {
        capturedRequest = req;
        return { text: 'Aku melihat gambar ini.' };
      },
    }),
  };

  const chat = createChatService({
    providers,
    getKey: () => KEY,
    getConfig: () => ({ provider: 'vision-p', model: 'v-1' }),
  });

  const base64Data = SAMPLE_PNG.toString('base64');
  await chat.send({
    text: 'Cek foto ini',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'rahasia.png' }],
  });

  // Provider receives attachment
  assert.equal(capturedRequest.attachments.length, 1);
  assert.equal(capturedRequest.attachments[0].name, 'rahasia.png');

  // Verify internal history does not contain base64 string
  // Let's send a second message and inspect what is passed in history
  let secondRequest = null;
  providers.get = () => ({
    id: 'vision-p',
    name: 'Vision Provider',
    defaultModel: 'v-1',
    supportsVision: () => true,
    send: async (req) => {
      secondRequest = req;
      return { text: 'Jawaban kedua.' };
    },
  });

  await chat.send('Pertanyaan lanjutan');
  assert.equal(secondRequest.messages.length >= 3, true);

  const serializedHistory = JSON.stringify(secondRequest.messages);
  assert.ok(!serializedHistory.includes(base64Data), 'History must never contain base64 image data');
  assert.ok(serializedHistory.includes('[Lampiran: rahasia.png]'), 'History retains metadata tag');
});

test('IMG-23: API keys and credentials never leak in chat error or outputs', async () => {
  const providers = {
    get: () => ({
      id: 'vision-p',
      name: 'Vision Provider',
      defaultModel: 'v-1',
      supportsVision: () => true,
      send: async () => {
        throw new ChatError('auth', 'API key ' + KEY + ' was rejected by upstream provider');
      },
    }),
  };

  const chat = createChatService({
    providers,
    getKey: () => KEY,
    getConfig: () => ({ provider: 'vision-p', model: 'v-1' }),
  });

  try {
    await chat.send({
      text: 'Halo',
      attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'foto.png' }],
    });
    assert.fail('Should have thrown ChatError');
  } catch (err) {
    assert.ok(err instanceof ChatError);
    assert.ok(!err.message.includes(KEY), 'Error message must not include API key');
    assert.ok(!String(err.stack).includes(KEY), 'Error stack must not include API key');
  }
});

test('IMG-20: timeout/abort releases busy state and frees service for subsequent requests', async () => {
  let callCount = 0;
  const providers = {
    get: () => ({
      id: 'vision-p',
      name: 'Vision Provider',
      defaultModel: 'v-1',
      supportsVision: () => true,
      send: async (req) => {
        callCount++;
        if (callCount === 1) {
          // Simulate timeout/abort
          return new Promise((_, reject) => {
            req.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }
        return { text: 'Berhasil setelah retry!' };
      },
    }),
  };

  const chat = createChatService({
    providers,
    getKey: () => KEY,
    getConfig: () => ({ provider: 'vision-p', model: 'v-1' }),
    timeoutMs: 30,
  });

  // First request times out
  try {
    await chat.send({
      text: 'Request yang lambat',
      attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'foto.png' }],
    });
  } catch (err) {
    // Expected to fail due to timeout
  }

  // Second request must succeed immediately without ChatError('busy')
  const res2 = await chat.send('Request kedua setelah timeout');
  assert.equal(res2.text, 'Berhasil setelah retry!');
  assert.equal(callCount, 2);
});

test('IMG-22: reset clears history, memory, and image reference tokens', async () => {
  const providers = {
    get: () => ({
      id: 'vision-p',
      name: 'Vision Provider',
      defaultModel: 'v-1',
      supportsVision: () => true,
      send: async () => ({ text: 'Deskripsi gambar.' }),
    }),
  };

  const chat = createChatService({
    providers,
    getKey: () => KEY,
    getConfig: () => ({ provider: 'vision-p', model: 'v-1' }),
  });

  await chat.send({
    text: 'Cek foto ini',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'foto.png' }],
  });
  assert.equal(chat.historyLength, 2);

  chat.reset();
  assert.equal(chat.historyLength, 0);

  // Next turn does not carry previous image context
  let nextReq = null;
  providers.get = () => ({
    id: 'vision-p',
    name: 'Vision Provider',
    defaultModel: 'v-1',
    supportsVision: () => true,
    send: async (req) => {
      nextReq = req;
      return { text: 'Jawaban obrolan baru.' };
    },
  });

  await chat.send('Obrolan baru');
  const userMessages = nextReq.messages.filter((m) => m.role === 'user');
  assert.equal(userMessages.length, 1);
  assert.equal(userMessages[0].content, 'Obrolan baru');
  assert.ok(!userMessages[0].content.includes('[Lampiran:'));

  const sysMsg = nextReq.messages.find((m) => m.role === 'system');
  assert.ok(!sysMsg.content.includes('Panduan analisis visual dan gambar'));
});
