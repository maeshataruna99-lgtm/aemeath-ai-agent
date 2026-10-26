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

// Removes every occurrence of the secret from text that may echo it back.
function redact(text, secret) {
  const value = String(text == null ? '' : text);
  if (!secret) return value;
  return value.split(secret).join('[kunci disembunyikan]');
}

module.exports = { ChatError, redact };
