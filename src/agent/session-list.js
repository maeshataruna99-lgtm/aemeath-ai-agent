'use strict';

// Lists Claude Code sessions for one working folder from file names and file
// times only. Transcript contents are never opened, so titles and messages stay
// where Claude Code put them (project rule section 8).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SESSION_ID } = require('./claude-adapter');

const MAX_LISTED = 5;

// Claude Code keeps a folder's sessions under a directory named after the folder.
function slugOf(dir) {
  return String(dir).replace(/[^A-Za-z0-9]/g, '-');
}

// -> [{ id, ageMs }], newest first
// options: { projectsDir?, now?() -> number, limit? }
function listSessions(dir, options) {
  const o = options || {};
  const base = o.projectsDir || path.join(os.homedir(), '.claude', 'projects');
  const now = (o.now || Date.now)();
  const folder = path.join(base, slugOf(dir));
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const id = entry.name.slice(0, -'.jsonl'.length);
    if (!SESSION_ID.test(id)) continue;
    try {
      found.push({ id, ageMs: Math.max(0, now - fs.statSync(path.join(folder, entry.name)).mtimeMs) });
    } catch {
      // vanished between listing and stat
    }
  }
  return found.sort((a, b) => a.ageMs - b.ageMs).slice(0, o.limit || MAX_LISTED);
}

module.exports = { listSessions, slugOf };
