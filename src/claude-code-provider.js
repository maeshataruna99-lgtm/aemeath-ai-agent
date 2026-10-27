'use strict';

// Watches Claude Code session transcripts under ~/.claude/projects and turns
// live JSONL appends into turn-started / turn-finished / turn-failed events.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const parser = require('./session-parser');

const COALESCE_MS = 300;
const RESCAN_MS = 15000;
const ACTIVE_MAX_AGE_MS = 10 * 60 * 1000;
// A pending decision may wait a long time for the human, but not forever.
const DECISION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function createClaudeCodeProvider(options) {
  const opts = options || {};
  const projectsDir = opts.projectsDir || path.join(os.homedir(), '.claude', 'projects');
  // When a custom projectsDir is passed in tests without antigravityDir, stay isolated to projectsDir.
  const antigravityDir =
    opts.antigravityDir !== undefined
      ? opts.antigravityDir
      : opts.projectsDir
        ? null
        : path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  const onEvent = opts.onEvent || function () {};

  const timers = new Map(); // file -> pending read timeout
  const tracked = new Map(); // file -> { offset, buffer, tracker, lastAppendAt }
  let watcher = null;
  let agWatcher = null;
  let rescanTimer = null;
  let running = false;

  function listSessionFiles() {
    const files = [];
    if (projectsDir && fs.existsSync(projectsDir)) {
      let dirs = [];
      try {
        dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      } catch {
        dirs = [];
      }
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const dirPath = path.join(projectsDir, dir.name);
        let entries;
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(path.join(dirPath, entry.name));
          }
        }
      }
    }
    if (antigravityDir && fs.existsSync(antigravityDir)) {
      let convs = [];
      try {
        convs = fs.readdirSync(antigravityDir, { withFileTypes: true });
      } catch {
        convs = [];
      }
      for (const conv of convs) {
        if (!conv.isDirectory()) continue;
        const transcript = path.join(antigravityDir, conv.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(transcript)) files.push(transcript);
      }
    }
    return files;
  }

  function ensureTracked(filePath) {
    let entry = tracked.get(filePath);
    if (!entry) {
      const isAg = path.basename(filePath) === 'transcript.jsonl';
      const mungedDir = isAg
        ? 'antigravity'
        : path.basename(path.dirname(filePath));
      const sessionId = isAg
        ? path.basename(path.resolve(filePath, '..', '..', '..'))
        : path.basename(filePath, '.jsonl');
      entry = {
        offset: 0,
        buffer: '',
        tracker: parser.createTracker(sessionId, mungedDir),
        lastAppendAt: 0,
      };
      tracked.set(filePath, entry);
    }
    return entry;
  }

  function processFile(filePath, isInitial) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      tracked.delete(filePath);
      return;
    }
    const entry = ensureTracked(filePath);
    if (stat.size < entry.offset) {
      // Truncated or rewritten: restart from zero without notifications.
      entry.offset = 0;
      entry.buffer = '';
      entry.tracker = parser.createTracker(entry.tracker.sessionId, entry.tracker.projectDir);
    }
    if (stat.size === entry.offset) return;

    let chunk;
    try {
      const fd = fs.openSync(filePath, 'r');
      try {
        const length = stat.size - entry.offset;
        chunk = Buffer.alloc(length);
        fs.readSync(fd, chunk, 0, length, entry.offset);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return;
    }
    entry.offset = stat.size;
    entry.lastAppendAt = Date.now();
    entry.buffer += chunk.toString('utf8');
    const lines = entry.buffer.split(/\r?\n/);
    entry.buffer = lines.pop() || '';
    if (isInitial) return;

    for (const line of lines) {
      const event = parser.parseLine(line);
      if (!event) continue;
      for (const emission of parser.feedEvent(entry.tracker, event, Date.now())) {
        onEvent(emission);
      }
    }
  }

  function scheduleRead(filePath, isInitial) {
    if (timers.has(filePath)) return;
    timers.set(filePath, true);
    setTimeout(() => {
      timers.delete(filePath);
      processFile(filePath, isInitial);
    }, COALESCE_MS);
  }

  function start() {
    if (running) return;
    running = true;
    // Index existing files silently: no notifications for history.
    for (const file of listSessionFiles()) processFile(file, true);
    try {
      watcher = fs.watch(projectsDir, { recursive: true }, (eventType, filename) => {
        if (typeof filename !== 'string' || !filename.endsWith('.jsonl')) return;
        scheduleRead(path.join(projectsDir, filename), false);
      });
    } catch {
      watcher = null; // recursive watch unavailable; the rescan covers it
    }
    if (antigravityDir && fs.existsSync(antigravityDir)) {
      try {
        agWatcher = fs.watch(antigravityDir, { recursive: true }, (eventType, filename) => {
          if (typeof filename !== 'string' || !filename.endsWith('transcript.jsonl')) return;
          scheduleRead(path.join(antigravityDir, filename), false);
        });
      } catch {
        agWatcher = null;
      }
    }
    rescanTimer = setInterval(() => {
      for (const file of listSessionFiles()) {
        if (tracked.has(file)) scheduleRead(file, false);
        else processFile(file, true); // brand new session file
      }
    }, RESCAN_MS);
    if (typeof rescanTimer.unref === 'function') rescanTimer.unref();
  }

  function stop() {
    running = false;
    if (watcher) watcher.close();
    watcher = null;
    if (agWatcher) agWatcher.close();
    agWatcher = null;
    if (rescanTimer) clearInterval(rescanTimer);
    rescanTimer = null;
    timers.clear();
  }

  // Sessions that appended recently and have not reached a terminal state.
  function activeSessionCount(now) {
    const at = now || Date.now();
    let count = 0;
    for (const entry of tracked.values()) {
      if (entry.tracker.state !== 'running') continue;
      if (at - entry.lastAppendAt > ACTIVE_MAX_AGE_MS) continue;
      count += 1;
    }
    return count;
  }

  function pendingDecisionCount(now) {
    const at = now || Date.now();
    let count = 0;
    for (const entry of tracked.values()) {
      if (!entry.tracker.pendingDecision) continue;
      if (at - entry.lastAppendAt > DECISION_MAX_AGE_MS) continue;
      count += 1;
    }
    return count;
  }

  function findSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;
    for (const entry of tracked.values()) {
      if (entry.tracker.sessionId === sessionId) {
        return {
          sessionId: entry.tracker.sessionId,
          projectName: parser.projectNameOf(entry.tracker),
          cwd: entry.tracker.cwd || null,
          state: entry.tracker.state,
          pendingDecision: Boolean(entry.tracker.pendingDecision),
        };
      }
    }
    return null;
  }

  return {
    start: start,
    stop: stop,
    activeSessionCount: activeSessionCount,
    pendingDecisionCount: pendingDecisionCount,
    listSessionFiles: listSessionFiles,
    findSession: findSession,
  };
}

module.exports = { createClaudeCodeProvider, ACTIVE_MAX_AGE_MS, DECISION_MAX_AGE_MS };
