'use strict';

// Reads the lorebook folder: sources.json plus every other *.json array of
// entries. Runs in the main process only.

const fs = require('node:fs');
const path = require('node:path');
const { validateLorebook } = require('./lorebook');

const SOURCES_FILE = 'sources.json';

function loadLorebook(dir) {
  const sources = JSON.parse(fs.readFileSync(path.join(dir, SOURCES_FILE), 'utf8'));
  const entries = [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== SOURCES_FILE)
    .sort();
  for (const name of files) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!Array.isArray(list)) throw new Error('lorebook: ' + name + ' must contain an array');
    entries.push(...list);
  }
  const data = { sources: sources, entries: entries };
  const problems = validateLorebook(data);
  if (problems.length > 0) throw new Error('lorebook: ' + problems.join('; '));
  return data;
}

module.exports = { loadLorebook };
