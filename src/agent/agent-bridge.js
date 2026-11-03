'use strict';

// The /claude command: one owner-typed message becomes one task that runs one
// Claude Code turn. The session id is remembered so the next message continues
// the same conversation. Nothing here stores prompt or answer text; the task
// store keeps metadata only (see task-store.js).
//
// File edits are denied by default. When a turn was denied only edits, the
// bridge remembers that for a few minutes, and a typed "/claude ya" resumes the
// same session once with edits allowed. Nothing else can approve: the approval
// call is reachable only from the owner's command line, never from model output.

const { EDIT_TOOLS: ADAPTER_EDIT_TOOLS } = require('./claude-adapter');

const CAPABILITY = 'agent.claude.run';
const TIMEOUT_MS = 180000;
const APPROVAL_MS = 5 * 60 * 1000;
// A session written this recently may still be open in another window.
const ACTIVE_MS = 60 * 1000;
const EDIT_TOOLS = new Set(ADAPTER_EDIT_TOOLS);
const APPROVED_PROMPT = 'The owner approved the file edits that were denied. Apply them now.';

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
  'bad_dir',
  'nothing_to_approve',
  'session_not_found',
  'session_active',
  'interrupted',
]);

// Catalog key for a failure code; anything unknown reads as a plain failure.
function messageKey(code) {
  if (code === 'empty_prompt') return 'agent.usage';
  return 'agent.' + (MESSAGE_CODES.has(code) ? code : 'error');
}

// The answer, plus what Claude wanted and how to allow it when something was denied.
function agentReply(tr, res) {
  if (!res.denials || res.denials.length === 0) return res.text;
  const list = res.denials.map((d) => d.tool + (d.target ? ' ' + d.target : '')).join(', ');
  return res.text + '\n\n' + tr('agent.denied', { list: list }) + ' ' + tr(res.approvable ? 'agent.approve_hint' : 'agent.denied_blocked');
}

function ageText(tr, ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return tr('agent.age_now');
  if (minutes < 60) return tr('agent.age_minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('agent.age_hours', { n: hours });
  return tr('agent.age_days', { n: Math.floor(hours / 24) });
}

// The current session id plus the recent sessions in the working folder, by number.
function sessionsReply(tr, current, list) {
  const lines = [current ? tr('agent.session_id', { id: current }) : tr('agent.no_session')];
  if (list.length === 0) {
    lines.push(tr('agent.sessions_none'));
  } else {
    lines.push(tr('agent.sessions_header'));
    list.forEach((s, i) => lines.push(tr('agent.session_row', { n: i + 1, id: s.id, age: ageText(tr, s.ageMs) })));
    lines.push(tr('agent.sessions_use'));
  }
  return lines.join('\n');
}

// The recent tasks as the Settings window shows them: status, times, and a catalog key for a failure.
// No prompt or answer text exists to show; the store keeps metadata only.
function taskRows(tasks, limit) {
  return tasks.slice(0, limit || 10).map((t) => ({
    status: t.status,
    createdAt: t.createdAt,
    durationMs: t.startedAt != null && t.endedAt != null ? t.endedAt - t.startedAt : null,
    attempts: t.attempts,
    errorKey: t.status === 'failed' ? messageKey(t.errorCode) : null,
  }));
}

// options: { store, runner, adapter, isEnabled() -> boolean, getDir?() -> path, now?() -> number,
//            listSessions?(dir) -> [{ id, ageMs }] }
// A session only resumes in the folder it started in, so changing folder drops it.
function createAgentBridge(options) {
  const { store, runner, adapter, isEnabled } = options;
  const getDir = options.getDir || (() => null);
  const now = options.now || Date.now;
  let sessionDir = null;
  let sessionId = null;
  let activeTaskId = null;
  let current = null; // settles when the running request has fully finished
  let pending = null; // { sessionId, dir, until }: edits waiting for the owner's "ya"

  function syncDir() {
    const dir = getDir();
    if (dir !== sessionDir) {
      sessionId = null;
      pending = null;
      sessionDir = dir;
    }
    return dir;
  }

  // -> { ok: true, text, sessionId, denials, approvable } | { ok: false, code }
  async function execute(prompt, input) {
    const task = store.create({ capability: CAPABILITY });
    activeTaskId = task.id;
    let answer = null;
    try {
      const running = runner.run(
        task.id,
        async ({ signal }) => {
          answer = await adapter.run(Object.assign({ prompt, signal }, input));
          return answer;
        },
        { timeoutMs: TIMEOUT_MS, validate: (r) => Boolean(r && typeof r.text === 'string' && r.text.trim()) }
      );
      current = running.then(() => {}, () => {});
      const done = await running;
      if (done.status !== 'succeeded') {
        return { ok: false, code: done.status === 'cancelled' ? 'cancelled' : done.errorCode || 'error' };
      }
      sessionId = answer.sessionId || sessionId;
      const denials = answer.denials || [];
      // Only a turn denied nothing but edits can be approved with "ya".
      const approvable = denials.length > 0 && denials.every((d) => EDIT_TOOLS.has(d.tool));
      pending = approvable ? { sessionId, dir: sessionDir, until: now() + APPROVAL_MS } : null;
      return { ok: true, text: answer.text, sessionId, denials, approvable };
    } finally {
      activeTaskId = null;
    }
  }

  // options: { onText?(delta) } receives the answer as it is written.
  async function ask(text, askOptions) {
    if (!isEnabled()) return { ok: false, code: 'disabled' };
    if (activeTaskId) return { ok: false, code: 'busy' };
    const prompt = String(text == null ? '' : text).trim();
    if (!prompt) return { ok: false, code: 'empty_prompt' };
    syncDir();
    pending = null; // a new message withdraws any earlier request
    return execute(prompt, { sessionId, onText: askOptions && askOptions.onText });
  }

  // Resumes the session that was denied edits and lets them through, once.
  async function approve(askOptions) {
    if (!isEnabled()) return { ok: false, code: 'disabled' };
    if (activeTaskId) return { ok: false, code: 'busy' };
    syncDir();
    const waiting = pending;
    pending = null;
    if (!waiting || waiting.dir !== sessionDir || waiting.until < now()) {
      return { ok: false, code: 'nothing_to_approve' };
    }
    return execute(APPROVED_PROMPT, {
      sessionId: waiting.sessionId,
      approveEdits: true,
      onText: askOptions && askOptions.onText,
    });
  }

  // Stops a running request and waits for it to end, so no process or record write is left behind.
  async function shutdown() {
    newSession();
    stop();
    if (current) await current;
  }

  // Shuts down, then deletes the task records. Chat history, persona and settings are not here to touch.
  async function purge() {
    await shutdown();
    store.purge();
  }

  function listRecent() {
    return options.listSessions ? options.listSessions(syncDir()) : [];
  }

  // Continues one of the listed sessions by its number. Resuming happens through
  // this adapter; nothing is written into any terminal.
  function useSession(number) {
    if (activeTaskId) return { ok: false, code: 'busy' };
    const picked = listRecent()[number - 1];
    if (!picked) return { ok: false, code: 'session_not_found' };
    // Two writers on one transcript corrupt it, so a session touched in the last minute is refused,
    // unless it is the one this bridge was already using.
    if (picked.ageMs < ACTIVE_MS && picked.id !== sessionId) return { ok: false, code: 'session_active' };
    sessionId = picked.id;
    pending = null;
    return { ok: true, id: picked.id };
  }

  // True while a request runs; the working folder is not changed under it.
  function busy() {
    return activeTaskId !== null;
  }

  function stop() {
    return activeTaskId ? runner.cancel(activeTaskId) : false;
  }

  function newSession() {
    sessionId = null;
    pending = null;
  }

  function currentSession() {
    return getDir() === sessionDir ? sessionId : null;
  }

  return { ask, approve, busy, stop, newSession, currentSession, listRecent, useSession, shutdown, purge };
}

module.exports = { createAgentBridge, messageKey, agentReply, sessionsReply, taskRows, CAPABILITY, EDIT_TOOLS };
