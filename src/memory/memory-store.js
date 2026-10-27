'use strict';

// Companion memory: the few things Rover allowed Aemeath to keep between
// conversations — the project he is on, tasks he has not finished, decisions he
// made, how he likes to be spoken to, the next step he agreed on.
//
// Deliberately NOT the lorebook. Lore lives in lorebook/ with its sources and
// verification, and it is canon; memory is personal context and may never
// overwrite a canon fact. The two are kept in separate files and never merged.
//
// Everything stays on this machine. The only thing that ever leaves it is the
// short block context() returns for one message, and only when a stored memory
// actually overlaps with what Rover typed.
//
// Stored as one small versioned JSON file in the app data folder. There is no
// vector database: with a few dozen entries, keyword overlap plus recency is
// enough and costs nothing.

const fs = require('node:fs');
const path = require('node:path');
const { containsSecret, redact } = require('../chat/chat-error');
const { keywords } = require('../chat/text');

const FILE_NAME = 'memory.json';
const VERSION = 1;
// Hard cap on stored memories. When it is reached new ones are refused instead
// of quietly deleting something Rover wrote.
const MAX_ENTRIES = 200;
const MAX_TEXT = 280;
const MAX_PROJECT = 60;
// How much of the memory may ride along with one chat request.
const MAX_CONTEXT_ENTRIES = 4;
const MAX_CONTEXT_CHARS = 700;
const DEFAULT_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 3650;
const MAX_OFFERS = 4;
const OFFER_TTL_MS = 10 * 60 * 1000;
// She does not offer the same continuation twice in one working day.
const CONTINUATION_GAP_MS = 6 * 60 * 60 * 1000;
// A project nobody touched for three weeks is not "what you were doing".
const CONTINUATION_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const KINDS = ['project', 'task', 'decision', 'preference', 'next-step', 'context'];
const KIND_LABEL = {
  project: 'proyek',
  task: 'tugas',
  decision: 'keputusan',
  preference: 'preferensi',
  'next-step': 'langkah berikutnya',
  context: 'konteks',
};
// Where a memory came from. `user` means Rover typed it; `assistant` is a
// summary Aemeath proposed and he accepted; `imported` arrived through a schema
// migration and its true author is unknown.
const SOURCES = ['user', 'assistant', 'imported'];
const SOURCE_LABEL = {
  user: 'dari kamu',
  assistant: 'ringkasan AI yang kamu setujui',
  imported: 'hasil migrasi',
};

// A next step or a task is worth more in a prompt than a loose note.
const KIND_WEIGHT = {
  'next-step': 1.2,
  task: 1.1,
  preference: 1.0,
  project: 0.9,
  decision: 0.8,
  context: 0.5,
};

function cleanText(raw, maxLen) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || MAX_TEXT);
}

function normalizeForCompare(text) {
  return cleanText(text, MAX_TEXT).toLowerCase();
}

function clampRetention(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(0, Math.round(value)));
}

function stampOf(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

// options: { dir, now?() -> number, maxEntries?, retentionDays? }
// Without `dir` the store still works, it just never reaches the disk (tests).
function createMemoryStore(options) {
  const opts = options || {};
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  const now = opts.now || Date.now;
  const maxEntries = typeof opts.maxEntries === 'number' && opts.maxEntries > 0 ? opts.maxEntries : MAX_ENTRIES;

  let state = {
    version: VERSION,
    disabled: false,
    retentionDays: clampRetention(opts.retentionDays || DEFAULT_RETENTION_DAYS),
    nextId: 1,
    lastContinuationAt: null,
    memories: [],
  };
  let readOnly = false; // a file written by a newer Aemeath: read, never overwrite
  let notice = null; // the UI shows why data was quarantined or migrated
  let prunedAtLoad = 0;
  let offers = []; // proposals waiting for Rover's answer, never persisted
  let offerSeq = 0;

  function nextId() {
    const id = 'mem-' + state.nextId;
    state.nextId += 1;
    return id;
  }

  function publicMemory(memory) {
    return {
      id: memory.id,
      kind: memory.kind,
      kindLabel: KIND_LABEL[memory.kind] || KIND_LABEL.context,
      text: memory.text,
      source: memory.source,
      sourceLabel: SOURCE_LABEL[memory.source] || SOURCE_LABEL.imported,
      project: memory.project,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      usedAt: memory.usedAt,
    };
  }

  // One stored entry, whichever schema it arrived in. Anything unusable is
  // dropped; anything usable keeps its original timestamps and author.
  function normalizeMemory(raw, at) {
    if (typeof raw === 'string') {
      const text = cleanText(raw);
      if (!text || containsSecret(text)) return null;
      return {
        id: nextId(),
        kind: 'context',
        text: text,
        source: 'imported',
        project: null,
        createdAt: at,
        updatedAt: at,
        usedAt: null,
      };
    }
    if (!raw || typeof raw !== 'object') return null;
    const text = cleanText(raw.text != null ? raw.text : raw.summary, MAX_TEXT);
    if (!text || containsSecret(text)) return null;
    const createdAt = stampOf(raw.createdAt, at);
    return {
      id: typeof raw.id === 'string' && raw.id ? cleanText(raw.id, 40) : nextId(),
      kind: KINDS.includes(raw.kind) ? raw.kind : 'context',
      text: text,
      source: SOURCES.includes(raw.source) ? raw.source : 'imported',
      project: raw.project ? cleanText(raw.project, MAX_PROJECT) : null,
      createdAt: createdAt,
      updatedAt: stampOf(raw.updatedAt, createdAt),
      usedAt: typeof raw.usedAt === 'number' && raw.usedAt > 0 ? raw.usedAt : null,
    };
  }

  function highestId(memories) {
    let highest = 0;
    for (const memory of memories) {
      const match = /^mem-(\d+)$/.exec(memory.id);
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    }
    return highest;
  }

  // A file that cannot be parsed is moved aside instead of overwritten: a bug in
  // this module must never be the reason someone's notes disappear.
  function quarantine(reason) {
    if (!file) return null;
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
    const target = path.join(path.dirname(file), 'memory.corrupt-' + stamp + '.json');
    try {
      fs.renameSync(file, target);
      notice = reason + ' File lamanya kupindahkan ke ' + path.basename(target) + ', tidak kuhapus.';
      return target;
    } catch {
      notice = reason;
      return null;
    }
  }

  function adoptMemories(list) {
    const at = now();
    const memories = [];
    for (const item of Array.isArray(list) ? list : []) {
      const memory = normalizeMemory(item, at);
      if (memory) memories.push(memory);
    }
    return memories;
  }

  function applyFile(parsed) {
    const at = now();
    // Unversioned or version 0: an array of entries, or an object with `memories`.
    const legacy = Array.isArray(parsed) || (parsed && typeof parsed === 'object' && parsed.version == null);
    if (legacy) {
      const list = Array.isArray(parsed) ? parsed : parsed && parsed.memories;
      state.memories = adoptMemories(list);
      state.nextId = Math.max(state.nextId, highestId(state.memories) + 1);
      state.disabled = Boolean(parsed && !Array.isArray(parsed) && parsed.disabled === true);
      state.retentionDays = clampRetention(
        parsed && !Array.isArray(parsed) && typeof parsed.retentionDays === 'number'
          ? parsed.retentionDays
          : DEFAULT_RETENTION_DAYS,
      );
      if (state.memories.length > 0) {
        notice = 'Memori lama dipindahkan ke format baru tanpa ada yang dihapus.';
      }
      return;
    }

    state.memories = adoptMemories(parsed.memories);
    state.nextId = Math.max(state.nextId, stampOf(parsed.nextId, 1), highestId(state.memories) + 1);
    state.disabled = parsed.disabled === true;
    state.retentionDays = clampRetention(parsed.retentionDays);
    state.lastContinuationAt =
      typeof parsed.lastContinuationAt === 'number' && parsed.lastContinuationAt > 0
        ? parsed.lastContinuationAt
        : null;
  }

  function load() {
    state = {
      version: VERSION,
      disabled: false,
      retentionDays: clampRetention(opts.retentionDays || DEFAULT_RETENTION_DAYS),
      nextId: 1,
      lastContinuationAt: null,
      memories: [],
    };
    readOnly = false;
    notice = null;

    if (!file) return state;
    let raw = null;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return state; // first run
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      quarantine('File memori tidak bisa dibaca.');
      return state;
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && parsed.version > VERSION) {
      // Written by a newer Aemeath. Read what is there, but never write back.
      readOnly = true;
      notice = 'File memori dibuat oleh versi Aemeath yang lebih baru, jadi hanya bisa dibaca.';
      applyFile({ version: parsed.version, memories: parsed.memories, disabled: parsed.disabled });
      prunedAtLoad = 0;
      return state;
    }
    applyFile(parsed);
    prunedAtLoad = prune(false);
    persist();
    return state;
  }

  function persist() {
    if (!file || readOnly) return false;
    const payload = {
      version: VERSION,
      disabled: state.disabled,
      retentionDays: state.retentionDays,
      nextId: state.nextId,
      lastContinuationAt: state.lastContinuationAt,
      memories: state.memories,
    };
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
      return true;
    } catch {
      // best effort: memory keeps working in this session
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
      return false;
    }
  }

  // Drops old AI summaries only. A memory Rover wrote himself is his until he
  // deletes it, which is why the filter checks the source first.
  function prune(save) {
    if (state.retentionDays <= 0) return 0;
    const cutoff = now() - state.retentionDays * DAY_MS;
    const kept = [];
    let removed = 0;
    for (const memory of state.memories) {
      const expirable = memory.source !== 'user';
      if (expirable && memory.updatedAt < cutoff) removed += 1;
      else kept.push(memory);
    }
    if (removed > 0) {
      state.memories = kept;
      if (save !== false) persist();
    }
    return removed;
  }

  function find(id) {
    return state.memories.find((memory) => memory.id === id) || null;
  }

  // Shared validation for storing and editing. Returns an error string or null.
  function validateText(text) {
    if (!text) return 'Tulis isi memorinya dulu ya, Rover.';
    if (containsSecret(text)) {
      return 'Jangan simpan API key, token, atau kata sandi sebagai memori ya. Simpan kunci di Pengaturan → Chatbot.';
    }
    return null;
  }

  function blocked() {
    if (readOnly) return 'File memori dari versi yang lebih baru tidak bisa Kuubah.';
    if (state.disabled) return 'Penyimpanan memori sedang dimatikan di Pengaturan → Memori.';
    return null;
  }

  // input: { text, kind?, source?, project? } -> { ok, memory } | { ok:false, error }
  function remember(input) {
    const denied = blocked();
    if (denied) return { ok: false, error: denied };
    const raw = input || {};
    const rawText = cleanText(raw.text, MAX_TEXT);
    const error = validateText(rawText);
    if (error) return { ok: false, error: error };
    // Belt and braces: even a pattern that slipped past the check is masked.
    const text = redact(rawText, null);

    // Saying the same thing twice just refreshes it.
    const existing = state.memories.find((memory) => normalizeForCompare(memory.text) === normalizeForCompare(text));
    if (existing) {
      existing.updatedAt = now();
      if (raw.project) existing.project = cleanText(raw.project, MAX_PROJECT);
      persist();
      return { ok: true, memory: publicMemory(existing), merged: true };
    }

    if (state.memories.length >= maxEntries) {
      return {
        ok: false,
        error: 'Memori sudah penuh (' + maxEntries + '). Hapus beberapa dulu di Pengaturan → Memori.',
      };
    }

    const at = now();
    const memory = {
      id: nextId(),
      kind: KINDS.includes(raw.kind) ? raw.kind : 'context',
      text: text,
      source: SOURCES.includes(raw.source) ? raw.source : 'user',
      project: raw.project ? cleanText(raw.project, MAX_PROJECT) : null,
      createdAt: at,
      updatedAt: at,
      usedAt: null,
    };
    state.memories.push(memory);
    persist();
    return { ok: true, memory: publicMemory(memory) };
  }

  // patch: { text?, kind?, project? }
  function update(id, patch) {
    const denied = blocked();
    if (denied) return { ok: false, error: denied };
    const memory = find(id);
    if (!memory) return { ok: false, error: 'Memori itu tidak ada lagi.' };
    const next = patch || {};
    if ('text' in next) {
      const rawText = cleanText(next.text, MAX_TEXT);
      const error = validateText(rawText);
      if (error) return { ok: false, error: error };
      memory.text = redact(rawText, null);
    }
    if (KINDS.includes(next.kind)) memory.kind = next.kind;
    if ('project' in next) memory.project = next.project ? cleanText(next.project, MAX_PROJECT) : null;
    memory.updatedAt = now();
    persist();
    return { ok: true, memory: publicMemory(memory) };
  }

  function forget(id) {
    const index = state.memories.findIndex((memory) => memory.id === id);
    if (index < 0) return false;
    state.memories.splice(index, 1);
    persist();
    return true;
  }

  function clear() {
    const removed = state.memories.length;
    state.memories = [];
    state.lastContinuationAt = null;
    offers = [];
    persist();
    return removed;
  }

  function setDisabled(on) {
    state.disabled = on === true;
    if (state.disabled) offers = [];
    persist();
    return state.disabled;
  }

  function setRetention(days) {
    state.retentionDays = clampRetention(typeof days === 'number' ? days : DEFAULT_RETENTION_DAYS);
    prune(true);
    persist();
    return state.retentionDays;
  }

  function list() {
    return state.memories
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(publicMemory);
  }

  function scoreOf(memory, queryWords, at) {
    let score = 0;
    if (queryWords.length > 0) {
      const words = new Set(keywords(memory.text + ' ' + (memory.project || '')));
      let overlap = 0;
      for (const word of queryWords) if (words.has(word)) overlap += 1;
      if (overlap === 0) return 0;
      score += overlap * 2 + overlap / queryWords.length;
    }
    score += KIND_WEIGHT[memory.kind] || 0.5;
    const age = Math.max(0, at - memory.updatedAt);
    if (age < DAY_MS) score += 1.5;
    else if (age < 7 * DAY_MS) score += 1;
    else if (age < 30 * DAY_MS) score += 0.4;
    return score;
  }

  function formatEntry(memory) {
    const where = memory.project ? ' · ' + memory.project : '';
    return '- [' + (KIND_LABEL[memory.kind] || 'konteks') + where + '] ' + memory.text;
  }

  // The only memory text that ever reaches the model: at most a few entries that
  // overlap with this message, capped in both count and characters.
  function context(query) {
    const empty = { entries: [], block: '', chars: 0 };
    if (state.disabled || state.memories.length === 0) return empty;
    const at = now();
    const queryWords = keywords(String(query == null ? '' : query));

    let picked = [];
    if (queryWords.length > 0) {
      picked = state.memories
        .map((memory) => ({ memory: memory, score: scoreOf(memory, queryWords, at) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
        .slice(0, MAX_CONTEXT_ENTRIES)
        .map((item) => item.memory);
    } else {
      // "Halo" carries no keywords. One recent unfinished thing is still worth
      // having in front of her, but only one, and only if it is recent.
      picked = state.memories
        .filter((memory) => ['next-step', 'task', 'project'].includes(memory.kind))
        .filter((memory) => at - memory.updatedAt <= 14 * DAY_MS)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 1);
    }
    if (picked.length === 0) return empty;

    const lines = [];
    const entries = [];
    let chars = 0;
    for (const memory of picked) {
      const lineText = formatEntry(memory);
      if (entries.length > 0 && chars + lineText.length > MAX_CONTEXT_CHARS) break;
      lines.push(lineText);
      entries.push({ id: memory.id, kind: memory.kind, text: memory.text, project: memory.project });
      chars += lineText.length + 1;
    }
    if (entries.length === 0) return empty;
    return { entries: entries, block: lines.join('\n'), chars: chars };
  }

  function used(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const at = now();
    let touched = 0;
    for (const id of ids) {
      const memory = find(id);
      if (!memory) continue;
      memory.usedAt = at;
      touched += 1;
    }
    if (touched > 0) persist();
    return touched;
  }

  // ---- Proactive offers -----------------------------------------------------
  // A proposal is spoken once and lives only in memory: if Rover does not answer
  // it, nothing is stored and it is gone after the app closes.

  function trimOffers(at) {
    offers = offers.filter((offer) => at - offer.at <= OFFER_TTL_MS).slice(-MAX_OFFERS);
  }

  // Full mode: after a coding session ends, offer to keep its summary.
  function proposeSession(input) {
    if (blocked()) return null;
    const raw = input || {};
    const summary = cleanText(raw.summary, MAX_TEXT);
    // Nothing to remember? Say nothing rather than invent a summary.
    if (summary.length < 12 || containsSecret(summary)) return null;
    const project = raw.project ? cleanText(raw.project, MAX_PROJECT) : null;
    const at = now();
    trimOffers(at);
    offerSeq += 1;
    const offer = {
      id: 'offer-' + offerSeq,
      at: at,
      project: project,
      sessionId: raw.sessionId || null,
      kind: 'context',
      memoryText: summary,
    };
    offers.push(offer);
    const where = project ? 'sesi di ' + project : 'sesi tadi';
    return {
      id: offer.id,
      project: project,
      actionable: true,
      text:
        'Rover, ' +
        where +
        ' sudah selesai. Mau kusimpan ringkasannya ke memori? ' +
        'Nanti bisa kupakai waktu kamu lanjut lagi.',
    };
  }

  function acceptOffer(id) {
    const denied = blocked();
    if (denied) return { ok: false, error: denied };
    const at = now();
    trimOffers(at);
    const index = offers.findIndex((offer) => offer.id === id);
    if (index < 0) return { ok: false, error: 'Penawaran itu sudah kedaluwarsa, Rover.' };
    const offer = offers[index];
    const result = remember({
      text: offer.memoryText,
      kind: offer.kind,
      source: 'assistant',
      project: offer.project,
    });
    if (!result.ok) return result;
    offers.splice(index, 1);
    return {
      ok: true,
      memory: result.memory,
      text: 'Sudah kusimpan di memori' + (offer.project ? ' untuk ' + offer.project : '') + '. Kalau mau diubah atau dihapus, ada di Pengaturan → Memori, ya~',
    };
  }

  function dismissOffer(id) {
    const index = offers.findIndex((offer) => offer.id === id);
    if (index < 0) return false;
    offers.splice(index, 1);
    return true;
  }

  // Medium and Full: one gentle offer to continue what he was doing. Low never
  // starts a conversation from memory, and a disabled store never speaks at all.
  function continuation(mode) {
    if (mode === 'low' || state.disabled) return null;
    const at = now();
    if (state.lastContinuationAt && at - state.lastContinuationAt < CONTINUATION_GAP_MS) return null;
    const candidates = state.memories
      .filter((memory) => ['project', 'task', 'next-step'].includes(memory.kind))
      .filter((memory) => at - memory.updatedAt <= CONTINUATION_MAX_AGE_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const memory = candidates[0];
    if (!memory) return null;

    let text = '';
    if (memory.kind === 'task') {
      text =
        'Rover, masih ada tugas yang belum selesai' +
        (memory.project ? ' di ' + memory.project : '') +
        ': ' +
        memory.text +
        '. Mau lanjut sekarang?';
    } else if (memory.kind === 'next-step') {
      text =
        'Rover, langkah berikutnya yang kamu catat' +
        (memory.project ? ' untuk ' + memory.project : '') +
        ': ' +
        memory.text +
        '. Mau kita mulai dari situ?';
    } else {
      text =
        'Rover, terakhir kamu mengerjakan ' +
        (memory.project || 'proyek ini') +
        ': ' +
        memory.text +
        ' Mau dilanjutkan?';
    }
    state.lastContinuationAt = at;
    persist();
    return { memory: publicMemory(memory), text: text };
  }

  function status() {
    const bySource = { user: 0, assistant: 0, imported: 0 };
    const byKind = {};
    for (const memory of state.memories) {
      bySource[memory.source] = (bySource[memory.source] || 0) + 1;
      byKind[memory.kind] = (byKind[memory.kind] || 0) + 1;
    }
    return {
      file: file,
      version: VERSION,
      disabled: state.disabled,
      readOnly: readOnly,
      notice: notice,
      retentionDays: state.retentionDays,
      count: state.memories.length,
      maxEntries: maxEntries,
      bySource: bySource,
      byKind: byKind,
      prunedAtLoad: prunedAtLoad,
      pendingOffers: offers.length,
    };
  }

  load();

  return {
    remember: remember,
    update: update,
    forget: forget,
    clear: clear,
    list: list,
    context: context,
    used: used,
    setDisabled: setDisabled,
    setRetention: setRetention,
    status: status,
    proposeSession: proposeSession,
    acceptOffer: acceptOffer,
    dismissOffer: dismissOffer,
    continuation: continuation,
    reload: load,
    get disabled() {
      return state.disabled;
    },
    get readOnly() {
      return readOnly;
    },
  };
}

module.exports = {
  createMemoryStore,
  FILE_NAME,
  VERSION,
  MAX_ENTRIES,
  MAX_TEXT,
  MAX_CONTEXT_ENTRIES,
  MAX_CONTEXT_CHARS,
  DEFAULT_RETENTION_DAYS,
  OFFER_TTL_MS,
  CONTINUATION_GAP_MS,
  CONTINUATION_MAX_AGE_MS,
  KINDS,
  KIND_LABEL,
  SOURCES,
  SOURCE_LABEL,
};
