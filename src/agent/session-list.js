'use strict';

// Lists Claude Code sessions for one working folder: id, age, and the name Claude Code gave it.
//
// A session's name comes from the title lines Claude Code writes into its own transcript
// (a name the owner set, or the one it made up). Only those lines are parsed: a line is looked at
// only if it starts with a title marker, so message text is never parsed or kept, and only the end
// of the file (and a little of its start) is read. Names are shown in the chat box and nowhere else:
// not stored, not logged, not sent to any model (decision D-016, project rule section 8).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SESSION_ID } = require('./claude-adapter');
const { redact } = require('../chat/chat-error');

const MAX_LISTED = 5;
const TAIL_BYTES = 1024 * 1024;
const HEAD_BYTES = 256 * 1024;
const MAX_TITLE = 40;

// Claude Code keeps a folder's sessions under a directory named after the folder.
function slugOf(dir) {
  return String(dir).replace(/[^A-Za-z0-9]/g, '-');
}

function cleanTitle(raw) {
  const text = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return redact(text.length > MAX_TITLE ? text.slice(0, MAX_TITLE - 1) + '…' : text);
}

function titleOf(line, key) {
  try {
    const value = JSON.parse(line)[key];
    return typeof value === 'string' ? cleanTitle(value) : '';
  } catch {
    return ''; // a line cut in half at the edge of what was read
  }
}

// The newest name in a chunk of transcript. A name the owner set wins over one Claude made up.
function newestTitle(text) {
  let custom = '';
  let generated = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('{"type":"custom-title"')) custom = titleOf(line, 'customTitle') || custom;
    else if (line.startsWith('{"type":"ai-title"')) generated = titleOf(line, 'aiTitle') || generated;
  }
  return custom || generated;
}

function readRange(fd, start, end) {
  const buffer = Buffer.alloc(end - start);
  const read = fs.readSync(fd, buffer, 0, buffer.length, start);
  return buffer.toString('utf8', 0, read);
}

// -> the session's name, or '' when it has none or the file cannot be read
function readTitle(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const fromTail = newestTitle(readRange(fd, Math.max(0, size - TAIL_BYTES), size));
    if (fromTail || size <= TAIL_BYTES) return fromTail;
    return newestTitle(readRange(fd, 0, Math.min(size, HEAD_BYTES)));
  } catch {
    return '';
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // already closed
      }
    }
  }
}

function folderOf(dir, options) {
  const base = (options && options.projectsDir) || path.join(os.homedir(), '.claude', 'projects');
  return path.join(base, slugOf(dir));
}

// -> [{ id, ageMs, title }], newest first. `title` is '' when the session has no name.
// options: { projectsDir?, now?() -> number, limit? }
function listSessions(dir, options) {
  const o = options || {};
  const now = (o.now || Date.now)();
  const folder = folderOf(dir, o);
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
  return found
    .sort((a, b) => a.ageMs - b.ageMs)
    .slice(0, o.limit || MAX_LISTED)
    .map((s) => Object.assign(s, { title: readTitle(path.join(folder, s.id + '.jsonl')) }));
}

// The name of one session, for the one in use when it is not among the newest few.
function sessionTitle(dir, id, options) {
  return SESSION_ID.test(String(id)) ? readTitle(path.join(folderOf(dir, options), id + '.jsonl')) : '';
}

module.exports = { listSessions, sessionTitle, slugOf };
