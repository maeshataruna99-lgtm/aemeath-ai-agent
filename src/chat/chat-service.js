'use strict';

// Conversation state and request flow for the chatbot. Runs in the main
// process: it is the only place that ever sees the API key. History lives in
// memory only and is dropped on reset or when the app closes.

const { ChatError, redact, containsSecret } = require('./chat-error');
const { buildSystemPrompt } = require('./persona');
const { isUnsafe, deflection } = require('./safety');
const { shouldSearch, isRealtimeQuery, formatSearchBlock } = require('./web-search');
const { detectJourneyWell, getJourneyWellReply } = require('./journey-well');
const { resolveTravelIntent, getTravelDialogue } = require('./travel-intent');
const { validateAttachments } = require('./attachment');

const MAX_INPUT = 600;
const MAX_HISTORY = 20; // user + assistant messages kept for context
const TIMEOUT_MS = 90000;
const OFFLINE_CODES = new Set(['network', 'timeout']);

// providers: registry from providers/index.js
// getKey(providerId) -> string | null
// getConfig() -> { provider, model }
// getKnowledge() -> [{ topic, text }] (optional)
// memory: { context(text) -> { entries, block }, used(ids) } (optional) — the
//   companion memory store. Only the few entries it returns for this message
//   are attached, never the whole store.
// getFeatures() -> { webSearch, offlineFallback, companion } (optional, all off by default;
//   companion = /change-mode-search, answering any topic instead of focusing on the game wiki)
// search: { search(text, { companion }) -> { results } } (optional)
// localResponder: { respond(text, reason) -> { text, sources } } (optional)
//
// send() resolves to { text, mode: 'ai' | 'local', sources: [{ title, url, license }] }.
function createChatService(options) {
  const providers = options.providers;
  const getKey = options.getKey;
  const getConfig = options.getConfig;
  const getKnowledge = options.getKnowledge || (() => []);
  const memory = options.memory || null;
  const getFeatures = options.getFeatures || (() => ({ webSearch: false, offlineFallback: false }));
  const search = options.search || null;
  const localResponder = options.localResponder || null;
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const maxHistory = options.maxHistory || MAX_HISTORY;

  let history = [];
  let busy = false;
  let turns = 0;

  function localAnswer(text, reason, picked) {
    const answer = localResponder.respond(text, reason);
    const entries = (picked && picked.entries) || [];
    // Without a key or a connection a relevant note still beats "I don't know".
    if (!answer.matched && entries.length > 0) {
      const top = entries[0];
      return {
        text: answer.text + '\n\nDari catatanku: ' + top.text,
        mode: 'local',
        sources: answer.sources || [],
        memoryUsed: markUsed({ entries: [top] }),
      };
    }
    const res = { text: answer.text, mode: 'local', sources: answer.sources || [] };
    if (answer.anim) res.anim = answer.anim;
    if (answer.animMs) res.animMs = answer.animMs;
    if (answer.event) res.event = answer.event;
    if (answer.emotion) res.emotion = answer.emotion;
    if (answer.travelIntent) res.travelIntent = answer.travelIntent;
    return res;
  }

  // A broken memory store must never break the chat, so every call is guarded.
  function readMemory(text) {
    if (!memory || typeof memory.context !== 'function') return { entries: [], block: '' };
    try {
      const picked = memory.context(text) || {};
      return {
        entries: Array.isArray(picked.entries) ? picked.entries : [],
        block: typeof picked.block === 'string' ? picked.block : '',
      };
    } catch {
      return { entries: [], block: '' };
    }
  }

  function markUsed(picked) {
    const entries = (picked && picked.entries) || [];
    if (entries.length === 0 || !memory || typeof memory.used !== 'function') return 0;
    try {
      memory.used(entries.map((entry) => entry.id));
    } catch {
      return 0;
    }
    return entries.length;
  }

  async function send(rawInput, onChunk, callOptions) {
    let rawText = '';
    let rawAttachments = [];

    if (typeof rawInput === 'string') {
      rawText = rawInput;
      rawAttachments = (callOptions && callOptions.attachments) || [];
    } else if (rawInput && typeof rawInput === 'object') {
      rawText = typeof rawInput.text === 'string' ? rawInput.text : '';
      rawAttachments = rawInput.attachments || (callOptions && callOptions.attachments) || [];
    }

    const attachments = validateAttachments(rawAttachments);

    const rawTrimmed = rawText.trim();
    const searchCmd = /^\/search(?:\s+([\s\S]*))?$/i.exec(rawTrimmed);
    const explicitSearch = Boolean(searchCmd || (callOptions && callOptions.forceSearch));
    let text = searchCmd ? (searchCmd[1] || '').trim() : rawTrimmed;
    if (!text) {
      if (attachments.length > 0) {
        text = attachments.length > 1
          ? 'Tolong bandingkan gambar-gambar ini dan jelaskan apa yang kamu lihat.'
          : 'Tolong jelaskan gambar ini.';
      } else {
        throw new ChatError(
          'empty-input',
          explicitSearch ? 'Tulis kata kunci setelah /search ya, Rover.' : 'Tulis sesuatu dulu, Rover.',
        );
      }
    }
    if (text.length > MAX_INPUT) {
      throw new ChatError('too-long', 'Pesannya terlalu panjang (maksimal ' + MAX_INPUT + ' karakter).');
    }
    if (busy) throw new ChatError('busy', 'Aemeath masih memikirkan pesan sebelumnya.');

    // Clearly inappropriate input never leaves the machine and is not remembered.
    turns += 1;
    if (isUnsafe(text)) return { text: deflection(turns), mode: 'local', sources: [], filtered: true };

    // Deterministic local triggers (e.g. Journey Well signature phrase) before model/network call
    let travel = null;
    if (!explicitSearch) {
      const jw = detectJourneyWell(text);
      if (jw.isDirectFarewell) {
        const replyText = getJourneyWellReply({ text: text, rng: options.rng });
        history.push({ role: 'user', content: text }, { role: 'assistant', content: replyText });
        if (history.length > maxHistory) history = history.slice(history.length - maxHistory);
        return {
          text: replyText,
          mode: 'local',
          sources: [],
          anim: jw.animation || 'waving',
          animMs: jw.animMs || 3000,
          event: 'journey-well-farewell',
          emotion: jw.emotion,
        };
      }

      travel = resolveTravelIntent(text, history);
      if (travel && travel.intent === 'departure') {
        const replyText = getTravelDialogue(travel, { rng: options.rng });
        history.push({ role: 'user', content: text }, { role: 'assistant', content: replyText });
        if (history.length > maxHistory) history = history.slice(history.length - maxHistory);
        return {
          text: replyText,
          mode: 'local',
          sources: [],
          anim: travel.animation || 'waving',
          animMs: 2500,
          event: 'travel-farewell',
          emotion: travel.emotion,
          travelIntent: travel.intent,
        };
      }
    }

    const features = getFeatures();
    const canFallBack = Boolean(features.offlineFallback && localResponder);
    // Read before the key check: the offline answer uses the same notes.
    const picked = readMemory(text);
    const config = getConfig();
    const provider = providers.get(config.provider);
    if (!provider) throw new ChatError('provider', 'Penyedia chatbot tidak dikenal.');

    const supportsVision =
      typeof provider.supportsVision === 'function'
        ? provider.supportsVision(config.model || provider.defaultModel)
      : Boolean(provider.capabilities && provider.capabilities.vision);

    if (attachments.length > 0 && !supportsVision) {
      throw new ChatError(
        'unsupported-capability',
        'Penyedia ' + provider.name + ' (' + (config.model || provider.defaultModel) + ') tidak mendukung input gambar.',
      );
    }

    const apiKey = getKey(provider.id);
    if (!apiKey) {
      if (canFallBack && !explicitSearch) return localAnswer(text, 'no-key', picked);
      throw new ChatError('no-key', 'Belum ada kunci API ' + provider.name + '. Atur dulu di Pengaturan.');
    }

    busy = true;
    // Companion mode only matters on this path: it needs a key and a model to answer.
    const companion = features.companion === true || explicitSearch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const safeText = redact(text, apiKey);
      let found = [];
      let searchStatus = null;
      if (explicitSearch && (!search || containsSecret(text, apiKey))) {
        return {
          text: 'Maaf Rover, pencarian web tidak dapat dijalankan untuk pesan ini.',
          mode: 'local',
          sources: [],
          searchStatus: 'error',
        };
      }
      if (
        search &&
        !containsSecret(text, apiKey) &&
        (explicitSearch || (features.webSearch && shouldSearch(safeText, { companion })))
      ) {
        const searchOpts = explicitSearch ? { companion: true, apiKey, force: true } : { companion, apiKey };
        const searchRes = (await search.search(safeText, searchOpts)) || {};
        found = searchRes.results || [];
        searchStatus =
          searchRes.status || (searchRes.error ? 'error' : found.length > 0 ? 'success' : 'empty');

        if (explicitSearch && searchStatus === 'error') {
          return {
            text: 'Maaf Rover, pencarian web gagal karena kendala jaringan atau batas waktu. Aku tidak mau menebak tanpa rujukan—coba lagi sebentar ya.',
            mode: 'local',
            sources: [],
            searchStatus: 'error',
          };
        }
        if (explicitSearch && searchStatus === 'empty') {
          return {
            text:
              'Aku sudah mencari di web, tapi tidak menemukan sumber yang valid untuk "' +
              safeText +
              '", Rover. Aku tidak akan mengarang jawaban tanpa bukti—coba kata kunci yang lebih spesifik ya.',
            mode: 'local',
            sources: [],
            searchStatus: 'empty',
          };
        }
      }
      let content = safeText;
      if (found.length > 0) {
        content = safeText + '\n\n' + formatSearchBlock(found);
      } else if (searchStatus && searchStatus !== 'success' && isRealtimeQuery(safeText)) {
        content =
          safeText +
          '\n\n[Catatan pencarian web: status=' +
          searchStatus +
          '. Pencarian web tidak menemukan sumber valid. Jangan menebak atau mengarang fakta, tanggal, atau angka terbaru dari ingatanmu; katakan terus terang kepada Rover bahwa pencarian web belum menemukan sumber yang terverifikasi.]';
      }
      if (travel && travel.intent !== 'none' && travel.confidence >= 0.7) {
        content =
          content +
          '\n\n[Konteks perjalanan: intent=' +
          travel.intent +
          ', subIntent=' +
          travel.subIntent +
          '. Tanggapi dengan kepedulian khas Aemeath tanpa mengada-ada bahaya palsu atau guilt-tripping.]';
      }
      const hasVisionContext =
        attachments.length > 0 || history.some((h) => h.content && h.content.includes('[Lampiran:'));
      const messages = [
        {
          role: 'system',
          content: buildSystemPrompt(getKnowledge(), {
            companion,
            memory: picked.block,
            vision: hasVisionContext,
          }),
        },
      ]
        .concat(history)
        .concat([{ role: 'user', content: content }]);
      const reply = await provider.send({
        apiKey,
        model: config.model || provider.defaultModel,
        messages: messages,
        attachments: attachments,
        signal: controller.signal,
        onChunk: typeof onChunk === 'function' ? (delta) => onChunk(redact(delta, apiKey)) : undefined,
      });
      const cleanReply = redact(reply.text, apiKey);
      const answer = isUnsafe(cleanReply) ? deflection(turns) : cleanReply;
      // History keeps what Rover typed (with any accidental key redacted), not the bulky search block or binary image data.
      const historyUserText =
        attachments.length > 0
          ? safeText + ' [Lampiran: ' + attachments.map((a) => a.name).join(', ') + ']'
          : safeText;
      history.push({ role: 'user', content: historyUserText }, { role: 'assistant', content: answer });
      if (history.length > maxHistory) history = history.slice(history.length - maxHistory);
      const result = { text: answer, mode: 'ai', sources: found.map((r) => r.source) };
      if (attachments.length > 0) {
        result.attachments = attachments.map((a) => ({
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
          width: a.width,
          height: a.height,
        }));
      }
      if (travel && travel.intent !== 'none' && travel.animation) {
        result.anim = travel.animation;
        result.event = 'travel-response';
        result.travelIntent = travel.intent;
      }
      const memoryUsed = markUsed(picked);
      if (memoryUsed > 0) result.memoryUsed = memoryUsed;
      if (searchStatus) result.searchStatus = searchStatus;
      return result;
    } catch (error) {
      const failure =
        error instanceof ChatError
          ? (containsSecret(error.message, apiKey)
              ? new ChatError(error.code, redact(error.message, apiKey))
              : error)
          : new ChatError('unknown', redact(error && error.message, apiKey) || 'Terjadi kesalahan.');
      if (OFFLINE_CODES.has(failure.code) && canFallBack) return localAnswer(text, 'offline', picked);
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
