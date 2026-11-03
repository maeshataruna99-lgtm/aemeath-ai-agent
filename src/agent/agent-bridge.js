'use strict';

// The /claude command: one owner-typed message becomes one task that runs one
// Claude Code turn. The session id is remembered so the next message continues
// the same conversation. Nothing here stores prompt or answer text; the task
// store keeps metadata only (see task-store.js).

const CAPABILITY = 'agent.claude.run';
const TIMEOUT_MS = 180000;

const MESSAGE_CODES = new Set([
  'disabled',
  'busy',
  'not_installed',
  'auth',
  'max_turns',
  'timeout',
  'api',
  'error',
  'no_result',
  'spawn_failed',
  'cancelled',
  'invalid_session',
]);

// Catalog key for a failure code; anything unknown reads as a plain failure.
function messageKey(code) {
  if (code === 'empty_prompt') return 'agent.usage';
  return 'agent.' + (MESSAGE_CODES.has(code) ? code : 'error');
}

// options: { store, runner, adapter, isEnabled() -> boolean }
function createAgentBridge(options) {
  const { store, runner, adapter, isEnabled } = options;
  let sessionId = null;
  let activeTaskId = null;

  // -> { ok: true, text, sessionId } | { ok: false, code }
  // options: { onText?(delta) } receives the answer as it is written.
  async function ask(text, askOptions) {
    if (!isEnabled()) return { ok: false, code: 'disabled' };
    if (activeTaskId) return { ok: false, code: 'busy' };
    const prompt = String(text == null ? '' : text).trim();
    if (!prompt) return { ok: false, code: 'empty_prompt' };

    const task = store.create({ capability: CAPABILITY });
    activeTaskId = task.id;
    let answer = null;
    try {
      const done = await runner.run(
        task.id,
        async ({ signal }) => {
          answer = await adapter.run({ prompt, sessionId, signal, onText: askOptions && askOptions.onText });
          return answer;
        },
        { timeoutMs: TIMEOUT_MS, validate: (r) => Boolean(r && typeof r.text === 'string' && r.text.trim()) }
      );
      if (done.status === 'succeeded') {
        sessionId = answer.sessionId || sessionId;
        return { ok: true, text: answer.text, sessionId };
      }
      return { ok: false, code: done.status === 'cancelled' ? 'cancelled' : done.errorCode || 'error' };
    } finally {
      activeTaskId = null;
    }
  }

  function stop() {
    return activeTaskId ? runner.cancel(activeTaskId) : false;
  }

  function newSession() {
    sessionId = null;
  }

  function currentSession() {
    return sessionId;
  }

  return { ask, stop, newSession, currentSession };
}

module.exports = { createAgentBridge, messageKey, CAPABILITY };
