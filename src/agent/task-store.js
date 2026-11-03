'use strict';

// Local task records for the agent bridge (docs/roadmap/AGENT_BRIDGE_ROADMAP.md, P1).
//
// Metadata only. Prompt text and CLI output are never stored here: they are
// owner-typed shell input and its output, which project rules sections 7 and 8
// forbid keeping. A record says what ran, when, and how it ended.
//
// One small versioned JSON file in the app data folder. Without `dir` the store
// works in memory only (tests).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE_NAME = 'tasks.json';
const VERSION = 1;
const MAX_TASKS = 200;

const STATUSES = ['pending', 'planning', 'awaiting_approval', 'running', 'succeeded', 'failed', 'cancelled'];
const NEXT = {
  pending: ['planning', 'running', 'cancelled', 'failed'],
  planning: ['awaiting_approval', 'running', 'failed', 'cancelled'],
  awaiting_approval: ['running', 'cancelled', 'failed'],
  // running -> pending is a retry between attempts
  running: ['succeeded', 'failed', 'cancelled', 'pending'],
  succeeded: [],
  failed: [],
  cancelled: [],
};
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
// Their worker died with the app, so they can never finish on their own.
const INTERRUPTED = new Set(['planning', 'awaiting_approval', 'running']);

const CAPABILITY = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
const ERROR_CODE = /^[a-z][a-z0-9_]{0,39}$/;

function coded(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// options: { dir?, now?() -> number }
function createTaskStore(options) {
  const opts = options || {};
  const now = opts.now || Date.now;
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  let tasks = [];

  function save() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, tasks }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function setAside() {
    fs.renameSync(file, path.join(path.dirname(file), 'tasks.corrupt-' + now() + '.json'));
  }

  function load() {
    if (!file || !fs.existsSync(file)) return;
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      data = null;
    }
    if (!data || data.version !== VERSION || !Array.isArray(data.tasks)) {
      setAside();
      return;
    }
    tasks = data.tasks;
    let changed = false;
    for (const task of tasks) {
      if (!INTERRUPTED.has(task.status)) continue;
      task.status = 'failed';
      task.errorCode = 'interrupted';
      task.endedAt = now();
      changed = true;
    }
    if (changed) save();
  }

  // Oldest finished records go first; a task still in flight is never dropped.
  function prune() {
    while (tasks.length > MAX_TASKS) {
      const index = tasks.findIndex((t) => TERMINAL.has(t.status));
      if (index === -1) return;
      tasks.splice(index, 1);
    }
  }

  function create(input) {
    const capability = input && input.capability;
    if (typeof capability !== 'string' || !CAPABILITY.test(capability)) throw coded('invalid_capability');
    const key = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 100) : null;
    if (key) {
      const dup = tasks.find((t) => t.idempotencyKey === key && t.status !== 'failed' && t.status !== 'cancelled');
      if (dup) return Object.assign({}, dup);
    }
    const task = {
      id: crypto.randomUUID(),
      capability,
      status: 'pending',
      idempotencyKey: key,
      sessionId: null,
      attempts: 0,
      errorCode: null,
      createdAt: now(),
      startedAt: null,
      endedAt: null,
    };
    tasks.push(task);
    prune();
    save();
    return Object.assign({}, task);
  }

  // patch: { sessionId?, attempts?, errorCode? }, anything else is ignored.
  function transition(id, status, patch) {
    const task = tasks.find((t) => t.id === id);
    if (!task) throw coded('not_found');
    if (!NEXT[task.status].includes(status)) throw coded('invalid_transition');
    const p = patch || {};
    task.status = status;
    if (typeof p.sessionId === 'string') task.sessionId = p.sessionId.slice(0, 100);
    if (Number.isInteger(p.attempts)) task.attempts = p.attempts;
    if (status === 'running' && task.startedAt === null) task.startedAt = now();
    if (TERMINAL.has(status)) {
      task.endedAt = now();
      task.errorCode = status === 'failed' ? (ERROR_CODE.test(p.errorCode) ? p.errorCode : 'error') : null;
    }
    save();
    return Object.assign({}, task);
  }

  function get(id) {
    const task = tasks.find((t) => t.id === id);
    return task ? Object.assign({}, task) : null;
  }

  function list() {
    return tasks.map((t) => Object.assign({}, t)).reverse();
  }

  load();
  return { create, transition, get, list };
}

module.exports = { createTaskStore, STATUSES, TERMINAL };
