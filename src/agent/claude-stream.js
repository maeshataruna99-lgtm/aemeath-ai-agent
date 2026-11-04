'use strict';

// Parser for `claude -p --output-format stream-json --verbose` output.
// Pure module: no I/O, no clock, no Electron. Shapes mirror lines observed from
// the real CLI; the login-failure shape is taken from a saved session transcript.

const { redact } = require('../chat/chat-error');

function parseLine(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return obj && typeof obj === 'object' && typeof obj.type === 'string' ? obj : null;
}

function blocks(content, type) {
  return Array.isArray(content) ? content.filter((b) => b && b.type === type) : [];
}

function textOf(content) {
  if (typeof content === 'string') return content.trim();
  return blocks(content, 'text')
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('\n')
    .trim();
}

// Tool calls the CLI refused for lack of approval, kept to a name and a target.
function denialsOf(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && typeof d.tool_name === 'string')
    .map((d) => {
      const input = d.tool_input || {};
      const target = input.file_path || input.notebook_path || input.path || input.command || '';
      return { tool: d.tool_name, target: String(target).slice(0, 200) };
    });
}

// What a tool call is about, as one short line for the status display: a file, a search
// pattern, a command, an address. Shown only; long values keep their tail, where a path differs.
function targetOf(input) {
  const i = input && typeof input === 'object' ? input : {};
  const raw = i.file_path || i.notebook_path || i.pattern || i.path || i.url || i.query || i.command || i.description || '';
  const text = String(raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return redact(text.length > 80 ? '\u2026' + text.slice(-79) : text);
}

// A failed login comes back as an assistant message flagged `error`, followed by
// a `result` whose subtype is still "success". The flag is the only reliable tell.
function toEvent(obj) {
  if (!obj) return null;
  const sessionId = obj.session_id || null;

  if (obj.type === 'system' && obj.subtype === 'init') {
    // The model the CLI really runs (an alias such as "opus" is resolved to its full name here).
    return { kind: 'session', sessionId, model: typeof obj.model === 'string' ? obj.model.slice(0, 60) : '' };
  }

  // Token-sized text arrives as stream_event lines when --include-partial-messages is on.
  if (obj.type === 'stream_event') {
    const delta = obj.event && obj.event.type === 'content_block_delta' ? obj.event.delta : null;
    if (delta && delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
      return { kind: 'delta', sessionId, text: delta.text };
    }
    const started = obj.event && obj.event.type === 'content_block_start' ? obj.event.content_block : null;
    if (started && started.type === 'thinking') return { kind: 'thinking', sessionId };
    return null;
  }

  if (obj.type === 'assistant') {
    const msg = obj.message || {};
    const text = textOf(msg.content);
    if (obj.error || obj.isApiErrorMessage || msg.model === '<synthetic>') {
      const reason = obj.error === 'authentication_failed' ? 'auth' : 'api';
      return { kind: 'failed', sessionId, reason, message: text };
    }
    if (text) return { kind: 'text', sessionId, text };
    const uses = blocks(msg.content, 'tool_use').map((b) => ({ name: String(b.name), target: targetOf(b.input) }));
    if (uses.length) return { kind: 'tool', sessionId, names: uses.map((u) => u.name), uses };
    return null;
  }

  if (obj.type === 'result') {
    const message = String(obj.result || obj.subtype || '');
    if (obj.subtype === 'success' && !obj.is_error) {
      return { kind: 'done', sessionId, text: message, denials: denialsOf(obj.permission_denials) };
    }
    const reason = obj.subtype === 'error_max_turns' ? 'max_turns' : 'error';
    return { kind: 'failed', sessionId, reason, message };
  }

  return null;
}

// Stateful wrapper: feed(line) returns one event or null. A failure reported by
// an assistant line swallows the `result` that follows, so one turn never yields
// both "failed" and "done". State resets at every result, so a long-lived
// process can run many turns through one parser.
function createStreamParser() {
  let failed = false;
  return function feed(line) {
    const obj = parseLine(line);
    const event = toEvent(obj);
    if (!event) return null;
    const isResult = obj.type === 'result';
    const hadFailed = failed;
    if (event.kind === 'failed') failed = true;
    if (isResult) failed = false;
    return hadFailed && isResult ? null : event;
  };
}

module.exports = { parseLine, toEvent, createStreamParser };
