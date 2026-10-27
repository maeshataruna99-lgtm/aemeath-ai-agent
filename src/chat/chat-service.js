'use strict';

// Conversation state and request flow for the chatbot. Runs in the main
// process: it is the only place that ever sees the API key. History lives in
// memory only and is dropped on reset or when the app closes.

const { ChatError, redact, containsSecret } = require('./chat-error');
const { buildSystemPrompt } = require('./persona');
const { isUnsafe, deflection } = require('./safety');
const { shouldSearch, formatSearchBlock } = require('./web-search');

const MAX_INPUT = 600;
const MAX_HISTORY = 20; // user + assistant messages kept for context
const TIMEOUT_MS = 90000;
const OFFLINE_CODES = new Set(['network', 'timeout']);

// providers: registry from providers/index.js
// getKey(providerId) -> string | null
// getConfig() -> { provider, model }
// getKnowledge() -> [{ topic, text }] (optional)
// getFeatures() -> { webSearch, offlineFallback } (optional, both off by default)
// search: { search(text) -> { results } } (optional)
// localResponder: { respond(text, reason) -> { text, sources } } (optional)
//
// send() resolves to { text, mode: 'ai' | 'local', sources: [{ title, url, license }] }.
function createChatService(options) {
  const providers = options.providers;
  const getKey = options.getKey;
  const getConfig = options.getConfig;
  const getKnowledge = options.getKnowledge || (() => []);
  const getFeatures = options.getFeatures || (() => ({ webSearch: false, offlineFallback: false }));
  const search = options.search || null;
  const localResponder = options.localResponder || null;
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const maxHistory = options.maxHistory || MAX_HISTORY;

  let history = [];
  let busy = false;
  let turns = 0;

  function localAnswer(text, reason) {
    const answer = localResponder.respond(text, reason);
    return { text: answer.text, mode: 'local', sources: answer.sources || [] };
  }

  async function send(rawText) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) throw new ChatError('empty-input', 'Tulis sesuatu dulu, Rover.');
    if (text.length > MAX_INPUT) {
      throw new ChatError('too-long', 'Pesannya terlalu panjang (maksimal ' + MAX_INPUT + ' karakter).');
    }
    if (busy) throw new ChatError('busy', 'Aemeath masih memikirkan pesan sebelumnya.');

    // Clearly inappropriate input never leaves the machine and is not remembered.
    turns += 1;
    if (isUnsafe(text)) return { text: deflection(turns), mode: 'local', sources: [], filtered: true };

    const features = getFeatures();
    const canFallBack = Boolean(features.offlineFallback && localResponder);
    const config = getConfig();
    const provider = providers.get(config.provider);
    if (!provider) throw new ChatError('provider', 'Penyedia chatbot tidak dikenal.');
    const apiKey = getKey(provider.id);
    if (!apiKey) {
      if (canFallBack) return localAnswer(text, 'no-key');
      throw new ChatError('no-key', 'Belum ada kunci API ' + provider.name + '. Atur dulu di Pengaturan.');
    }

    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const safeText = redact(text, apiKey);
      let found = [];
      if (features.webSearch && search && !containsSecret(text, apiKey) && shouldSearch(safeText)) {
        found = (await search.search(safeText)).results || [];
      }
      const content = found.length > 0 ? safeText + '\n\n' + formatSearchBlock(found) : safeText;
      const messages = [{ role: 'system', content: buildSystemPrompt(getKnowledge()) }]
        .concat(history)
        .concat([{ role: 'user', content: content }]);
      const reply = await provider.send({
        apiKey: apiKey,
        model: config.model || provider.defaultModel,
        messages: messages,
        signal: controller.signal,
      });
      const cleanReply = redact(reply.text, apiKey);
      const answer = isUnsafe(cleanReply) ? deflection(turns) : cleanReply;
      // History keeps what Rover typed (with any accidental key redacted), not the bulky search block.
      history.push({ role: 'user', content: safeText }, { role: 'assistant', content: answer });
      if (history.length > maxHistory) history = history.slice(history.length - maxHistory);
      return { text: answer, mode: 'ai', sources: found.map((r) => r.source) };
    } catch (error) {
      const failure =
        error instanceof ChatError
          ? error
          : new ChatError('unknown', redact(error && error.message, apiKey) || 'Terjadi kesalahan.');
      if (OFFLINE_CODES.has(failure.code) && canFallBack) return localAnswer(text, 'offline');
      throw failure;
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  }

  return {
    send: send,
    reset: () => {
      history = [];
    },
    get busy() {
      return busy;
    },
    get historyLength() {
      return history.length;
    },
  };
}

module.exports = { createChatService, MAX_INPUT, MAX_HISTORY };
