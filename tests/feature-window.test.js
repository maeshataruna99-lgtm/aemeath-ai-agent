'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BUILTIN_NAMES, RESERVED, normalizeCommands } = require('../src/commands/command-store');
const { createCommandHandler } = require('../src/commands/command-handler');
const { getGuideEntries, getGuideEntryById } = require('../src/feature-guide/guide-data');
const { createSearchIndex } = require('../src/feature-guide/search-index');

test('feature command is in BUILTIN_NAMES and RESERVED set', () => {
  assert.ok(BUILTIN_NAMES.includes('feature'));
  assert.ok(RESERVED.has('feature'));

  // Ensure a custom command cannot be named "feature"
  const normalized = normalizeCommands([{ name: 'feature', target: 'https://example.com' }]);
  assert.equal(normalized.commands.length, 0);
  assert.match(normalized.errors[0].message, /sudah dipakai perintah bawaan/);
});

test('feature command execution routes to guidebook builtin while preserving /help and /bantuan', async () => {
  let featureOpened = false;

  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: {
      feature: {
        description: 'Buka Aemeath Guidebook (buku panduan fitur)',
        run: async () => {
          featureOpened = true;
          return { ok: true, text: 'Membuka Aemeath Guidebook~' };
        },
      },
    },
  });

  // 1. /feature calls the guidebook handler
  const featureRes = await handler.handle('/feature');
  assert.equal(featureRes.isCommand, true);
  assert.equal(featureRes.ok, true);
  assert.equal(featureOpened, true);
  assert.match(featureRes.text, /Guidebook/);

  // 2. /help and /bantuan retain their original helpText behavior
  const helpRes = await handler.handle('/help');
  assert.equal(helpRes.isCommand, true);
  assert.equal(helpRes.ok, true);
  assert.match(helpRes.text, /Bawaan:/);
  assert.match(helpRes.text, /\/feature/);

  const bantuanRes = await handler.handle('/bantuan');
  assert.equal(bantuanRes.isCommand, true);
  assert.equal(bantuanRes.ok, true);
  assert.match(bantuanRes.text, /Bawaan:/);
});

test('guidebook data and search integration test', () => {
  const entries = getGuideEntries();
  assert.equal(entries.length, 11);

  const index = createSearchIndex(entries);

  // Search by command syntax
  const cmdResults = index.search('/todo');
  assert.ok(cmdResults.length > 0);
  assert.equal(cmdResults[0].id, 'productivity');

  // Search by keyword
  const privResults = index.search('incognito');
  assert.ok(privResults.length > 0);
  assert.equal(privResults[0].id, 'privacy-safety');

  // Specific id lookup
  const gettingStarted = getGuideEntryById('getting-started');
  assert.ok(gettingStarted);
  assert.equal(gettingStarted.title, 'Getting Started');
});
