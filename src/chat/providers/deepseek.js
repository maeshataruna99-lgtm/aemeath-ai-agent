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
  // onChunk: optional callback(deltaText) for streaming mode
  async function send({ apiKey, model, messages, signal, onChunk }) {
    if (typeof fetchImpl !== 'function') throw new ChatError('network', 'fetch tidak tersedia.');
    const isStream = typeof onChunk === 'function';
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
          stream: isStream,
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

    if (isStream && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
              if (delta) {
                accumulated += delta;
                onChunk(delta);
              }
            } catch {}
          }
        }
      } finally {
        reader.releaseLock();
      }
      const trimmedResult = accumulated.trim();
      if (!trimmedResult) throw new ChatError('empty', 'DeepSeek tidak memberi jawaban. Coba kirim ulang.');
      return { text: trimmedResult };
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
