'use strict';

// DeepSeek chat provider (OpenAI-compatible Chat Completions API).
// Docs: https://api-docs.deepseek.com/api/create-chat-completion

const { ChatError, redact } = require('../chat-error');

const BASE_URL = 'https://api.deepseek.com';
const MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek Flash (cepat)' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (lebih pintar)' },
];
// A desktop pet answers in a sentence or two, so keep replies short and cheap.
const MAX_TOKENS = 600;
const ERROR_BODY_LIMIT = 200;

function statusError(status, detail) {
  switch (status) {
    case 401:
      return new ChatError('auth', 'Kunci API ditolak DeepSeek. Periksa kunci di Pengaturan.');
    case 402:
      return new ChatError('balance', 'Saldo DeepSeek habis. Isi saldo di platform DeepSeek.');
    case 429:
      return new ChatError('rate', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
    case 400:
    case 422:
      return new ChatError('format', 'DeepSeek menolak permintaan' + (detail ? ': ' + detail : '.'));
    default:
      if (status >= 500) {
        return new ChatError('server', 'Server DeepSeek sedang bermasalah (' + status + '). Coba lagi nanti.');
      }
      return new ChatError('http', 'DeepSeek membalas dengan status ' + status + '.');
  }
}

function createDeepSeekProvider(options) {
  const fetchImpl = (options && options.fetchImpl) || globalThis.fetch;

  // messages: [{ role: 'system'|'user'|'assistant', content }]
  async function send({ apiKey, model, messages, signal }) {
    if (typeof fetchImpl !== 'function') throw new ChatError('network', 'fetch tidak tersedia.');
    let response;
    try {
      response = await fetchImpl(BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: false,
          thinking: { type: 'disabled' },
          max_tokens: MAX_TOKENS,
        }),
        signal: signal,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ChatError('timeout', 'DeepSeek terlalu lama menjawab. Coba lagi.');
      }
      throw new ChatError('network', 'Tidak bisa terhubung ke DeepSeek. Periksa koneksi internetmu.');
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
      } catch {
        detail = '';
      }
      throw statusError(response.status, redact(detail, apiKey).slice(0, ERROR_BODY_LIMIT));
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ChatError('format', 'Balasan DeepSeek tidak bisa dibaca.');
    }
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const text = choice && choice.message && typeof choice.message.content === 'string'
      ? choice.message.content.trim()
      : '';
    if (!text) throw new ChatError('empty', 'DeepSeek tidak memberi jawaban. Coba kirim ulang.');
    return { text: text };
  }

  return {
    id: 'deepseek',
    name: 'DeepSeek',
    models: MODELS,
    defaultModel: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    send: send,
  };
}

module.exports = { createDeepSeekProvider, BASE_URL, MODELS, MAX_TOKENS };
