'use strict';

// Local-only storage for chat API keys. Keys are encrypted with the OS
// credential store (Electron safeStorage, DPAPI on Windows) and written to the
// app's userData directory, never to the project folder. When encryption is not
// available the key is kept in memory for this run only and nothing is written.

const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'chat-keys.json';
const KEY_PATTERN = /^[\x21-\x7E]{8,256}$/;

// crypto: { isAvailable(): boolean, encrypt(text): Buffer, decrypt(buffer): string }
function createKeyStore(options) {
  const file = path.join(options.dir, FILE_NAME);
  const crypto = options.crypto;
  const memory = new Map();
  let stored = {}; // providerId -> base64 ciphertext

  function secure() {
    try {
      return Boolean(crypto && crypto.isAvailable());
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      stored = {};
    }
  }

  function persist() {
    try {
      fs.mkdirSync(options.dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(stored, null, 2), { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }

  function get(providerId) {
    if (memory.has(providerId)) return memory.get(providerId);
    const cipher = stored[providerId];
    if (typeof cipher !== 'string' || !secure()) return null;
    try {
      const plain = crypto.decrypt(Buffer.from(cipher, 'base64'));
      return KEY_PATTERN.test(plain) ? plain : null;
    } catch {
      return null; // unreadable (other user or machine): treat as no key
    }
  }

  // Returns { ok, persisted } or { ok: false, error }.
  function set(providerId, rawKey) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!KEY_PATTERN.test(key)) {
      return { ok: false, error: 'Format kunci tidak valid. Tempel kunci tanpa spasi.' };
    }
    if (!secure()) {
      memory.set(providerId, key);
      return { ok: true, persisted: false };
    }
    try {
      stored[providerId] = crypto.encrypt(key).toString('base64');
    } catch {
      memory.set(providerId, key);
      return { ok: true, persisted: false };
    }
    memory.delete(providerId);
    return { ok: true, persisted: persist() };
  }

  function clear(providerId) {
    memory.delete(providerId);
    delete stored[providerId];
    if (fs.existsSync(file)) persist();
  }

  function has(providerId) {
    return get(providerId) !== null;
  }

  load();
  return { get: get, set: set, clear: clear, has: has, get secure() { return secure(); } };
}

module.exports = { createKeyStore, KEY_PATTERN, FILE_NAME };
