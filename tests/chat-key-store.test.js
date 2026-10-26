'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createKeyStore, FILE_NAME } = require('../src/chat/key-store');

const KEY = 'sk-test-0123456789abcdef';

// Reversible stand-in for safeStorage: not real encryption, but it makes the
// stored bytes differ from the plaintext so leaks are detectable.
const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (text) => Buffer.from(Buffer.from(text, 'utf8').reverse()),
  decrypt: (buffer) => Buffer.from(buffer).reverse().toString('utf8'),
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-keys-'));
}

test('a saved key survives a restart and is never stored in plaintext', () => {
  const dir = tempDir();
  const store = createKeyStore({ dir, crypto: fakeCrypto });
  assert.equal(store.has('deepseek'), false);
  assert.deepEqual(store.set('deepseek', '  ' + KEY + '  '), { ok: true, persisted: true });

  const raw = fs.readFileSync(path.join(dir, FILE_NAME), 'utf8');
  assert.ok(!raw.includes(KEY), 'plaintext key found on disk');

  const reopened = createKeyStore({ dir, crypto: fakeCrypto });
  assert.equal(reopened.get('deepseek'), KEY);
  assert.equal(reopened.has('deepseek'), true);
});

test('clear removes the key from memory and disk', () => {
  const dir = tempDir();
  const store = createKeyStore({ dir, crypto: fakeCrypto });
  store.set('deepseek', KEY);
  store.clear('deepseek');
  assert.equal(store.get('deepseek'), null);
  assert.equal(createKeyStore({ dir, crypto: fakeCrypto }).get('deepseek'), null);
  assert.ok(!fs.readFileSync(path.join(dir, FILE_NAME), 'utf8').includes('deepseek":'));
});

test('without OS encryption the key stays in memory and no file is written', () => {
  const dir = tempDir();
  const store = createKeyStore({ dir, crypto: { isAvailable: () => false } });
  assert.deepEqual(store.set('deepseek', KEY), { ok: true, persisted: false });
  assert.equal(store.get('deepseek'), KEY);
  assert.equal(fs.existsSync(path.join(dir, FILE_NAME)), false);
  assert.equal(store.secure, false);
  assert.equal(createKeyStore({ dir, crypto: { isAvailable: () => false } }).get('deepseek'), null);
});

test('malformed keys are rejected', () => {
  const store = createKeyStore({ dir: tempDir(), crypto: fakeCrypto });
  for (const bad of ['', 'short', 'has space inside-key', 'sk-\nnewline-key', 'k'.repeat(300), null, 42]) {
    assert.equal(store.set('deepseek', bad).ok, false, String(bad));
  }
  assert.equal(store.has('deepseek'), false);
});

test('a corrupted or undecryptable store is treated as having no key', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, FILE_NAME), '{not json');
  assert.equal(createKeyStore({ dir, crypto: fakeCrypto }).get('deepseek'), null);

  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify({ deepseek: 'AAAA' }));
  const throwing = {
    isAvailable: () => true,
    encrypt: fakeCrypto.encrypt,
    decrypt: () => {
      throw new Error('wrong user');
    },
  };
  assert.equal(createKeyStore({ dir, crypto: throwing }).get('deepseek'), null);
});
