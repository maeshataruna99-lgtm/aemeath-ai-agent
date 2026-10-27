'use strict';

// Errors raised by the chat layer. `code` is stable for callers and tests,
// `message` is shown to the user in Indonesian and must never contain an API
// key (see redact()).

class ChatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}

const REDACTED_LABEL = '[kunci disembunyikan]';

// Common API key / token / secret assignment patterns that must never leave the machine
// or be echoed in logs, error messages, search queries, or diffs.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[\x21-\x7E]{8,}/gi,
  /\b(?:api[_-]?key|deepseek[_-]?api[_-]?key|deepseek[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|passwd)\s*[:=]\s*['"]?[\x21-\x7E]{6,}['"]?/gi,
];

function containsSecret(text, secret) {
  const value = String(text == null ? '' : text);
  if (!value) return false;
  if (secret && typeof secret === 'string' && value.includes(secret)) return true;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) return true;
  }
  return false;
}

// Removes every occurrence of the explicit secret as well as recognized API key /
// credential patterns from text.
function redact(text, secret) {
  let value = String(text == null ? '' : text);
  if (secret && typeof secret === 'string') {
    value = value.split(secret).join(REDACTED_LABEL);
  }
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    value = value.replace(pattern, REDACTED_LABEL);
  }
  return value;
}

module.exports = { ChatError, redact, containsSecret, REDACTED_LABEL };
