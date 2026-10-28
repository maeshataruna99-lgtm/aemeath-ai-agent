'use strict';

// Google Gemini chat provider with official multimodal (vision) support.
// Docs: https://ai.google.dev/api/generate-content

const { ChatError, redact } = require('../chat-error');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Cepat & Vision)', vision: true },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Multimodal)', vision: true },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Multimodal Cerdas)', vision: true },
];

const MAX_TOKENS = 600;
const ERROR_BODY_LIMIT = 200;

function statusError(status, detail) {
  switch (status) {
    case 400:
    case 422:
      return new ChatError('format', 'Google Gemini menolak permintaan' + (detail ? ': ' + detail : '.'));
    case 401:
    case 403:
      return new ChatError('auth', 'Kunci API ditolak Google Gemini. Periksa kunci di Pengaturan.');
    case 429:
      return new ChatError('rate', 'Batas kuota Gemini terlampaui. Coba lagi sebentar lagi.');
    default:
      if (status >= 500) {
        return new ChatError('server', 'Server Google Gemini sedang bermasalah (' + status + '). Coba lagi nanti.');
      }
      return new ChatError('http', 'Google Gemini membalas dengan status ' + status + '.');
  }
}

function formatGeminiPayload(messages, attachments, maxTokens) {
  let systemInstruction = null;
  const contents = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'system') {
      systemInstruction = {
        parts: [{ text: msg.content || '' }],
      };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (msg.content) {
      parts.push({ text: msg.content });
    }

    // Attachments belong to the latest user message
    if (i === messages.length - 1 && role === 'user' && Array.isArray(attachments)) {
      attachments.forEach((att) => {
        if (att && att.data && att.mimeType) {
          parts.push({
            inline_data: {
              mime_type: att.mimeType,
              data: att.data,
            },
          });
        }
      });
    }

    if (parts.length > 0) {
      const lastContent = contents[contents.length - 1];
      if (lastContent && lastContent.role === role) {
        lastContent.parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }
  }

  const payload = {
    contents: contents,
    generationConfig: {
      maxOutputTokens: maxTokens || MAX_TOKENS,
      temperature: 0.7,
    },
  };

  if (systemInstruction) {
    payload.system_instruction = systemInstruction;
  }

  return payload;
}

function createGeminiProvider(options) {
  const fetchImpl = (options && options.fetchImpl) || globalThis.fetch;

  function supportsVision(modelId) {
    const model = MODELS.find((m) => m.id === modelId);
    return Boolean(model && model.vision);
  }

  async function send({ apiKey, model, messages, attachments, signal, onChunk }) {
    if (typeof fetchImpl !== 'function') throw new ChatError('network', 'fetch tidak tersedia.');
    const isStream = typeof onChunk === 'function';
    const targetModel = model || MODELS[0].id;
    const payload = formatGeminiPayload(messages, attachments, MAX_TOKENS);

    const action = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `${BASE_URL}/models/${targetModel}:${action}`;

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: signal,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ChatError('timeout', 'Google Gemini terlalu lama menjawab. Coba lagi.');
      }
      throw new ChatError('network', 'Tidak bisa terhubung ke Google Gemini. Periksa koneksi internetmu.');
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
              const candidate = parsed.candidates && parsed.candidates[0];
              const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
              const delta = part && part.text;
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
      if (!trimmedResult) throw new ChatError('empty', 'Google Gemini tidak memberi jawaban. Coba kirim ulang.');
      return { text: trimmedResult };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ChatError('format', 'Balasan Google Gemini tidak bisa dibaca.');
    }

    const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
    const part = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts[0] : null;
    const text = part && typeof part.text === 'string' ? part.text.trim() : '';

    if (!text) throw new ChatError('empty', 'Google Gemini tidak memberi jawaban. Coba kirim ulang.');
    return { text: text };
  }

  return {
    id: 'gemini',
    name: 'Google Gemini',
    models: MODELS,
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    capabilities: { vision: true },
    supportsVision: supportsVision,
    send: send,
  };
}

module.exports = { createGeminiProvider, formatGeminiPayload, BASE_URL, MODELS, MAX_TOKENS };
