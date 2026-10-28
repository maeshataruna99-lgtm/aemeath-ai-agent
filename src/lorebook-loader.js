'use strict';

// Reads the lorebook folder: sources.json plus every other *.json array of
// entries. Runs in the main process only.

const fs = require('node:fs');
const path = require('node:path');
const { validateLorebook } = require('./lorebook');

const SOURCES_FILE = 'sources.json';

function normalizeEntry(item, sources) {
  if (!item || typeof item !== 'object') return item;
  const source = sources && sources[item.source];
  return Object.assign({}, item, {
    status: item.status || 'verified',
    kind: item.kind || 'canon',
    checkedAt: item.checkedAt || (source && source.accessed) || '2026-10-27',
  });
}

function loadLorebook(dir, overlayFile) {
  const sources = JSON.parse(fs.readFileSync(path.join(dir, SOURCES_FILE), 'utf8'));
  const entries = [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== SOURCES_FILE)
    .sort();
  for (const name of files) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!Array.isArray(list)) throw new Error('lorebook: ' + name + ' must contain an array');
    for (const item of list) {
      entries.push(normalizeEntry(item, sources));
    }
  }
  if (overlayFile && fs.existsSync(overlayFile)) {
    try {
      const overlay = JSON.parse(fs.readFileSync(overlayFile, 'utf8'));
      if (overlay && overlay.sources && typeof overlay.sources === 'object') {
        Object.assign(sources, overlay.sources);
      }
      if (overlay && Array.isArray(overlay.entries)) {
        const existingIds = new Set(entries.map((e) => e && e.id));
        for (const item of overlay.entries) {
          if (item && item.id && !existingIds.has(item.id) && sources[item.source]) {
            entries.push(normalizeEntry(item, sources));
            existingIds.add(item.id);
          }
        }
      }
    } catch {
      // ignore corrupted overlay and keep shipped lorebook
    }
  }
  const data = { sources: sources, entries: entries };
  const problems = validateLorebook(data);
  if (problems.length > 0) throw new Error('lorebook: ' + problems.join('; '));
  return data;
}

module.exports = { loadLorebook };
